/**
 * Scheduler des notifications — NKONI V2 (§5).
 *
 * Tâche planifiée QUOTIDIENNE (node-cron, in-process) : COTISATION_RETARD. Chaque jour,
 * pour chaque Membre ACTIF ayant un compte Utilisateur lié, on recalcule son statut via
 * `calculerStatutContribution` (fonction pure existante — AUCUNE réimplémentation) ; si
 * NON_A_JOUR, on lui crée une notification, sauf si une notification COTISATION_RETARD
 * NON LUE datant de moins de 7 jours existe déjà (anti-spam, cf. plus bas).
 *
 * Exécution :
 *   - `executerVerificationRetards(prisma, anneeCourante, now)` : point d'entrée MANUEL,
 *     déterministe (anneeCourante + now injectés) → testable sans le vrai cron ni horloge.
 *   - `demarrerScheduler(app)` : enregistre le cron (03:00, Africa/Douala) qui appelle le
 *     point d'entrée. Démarré UNIQUEMENT depuis le bootstrap serveur (app.listen), jamais
 *     par buildApp → les tests n'enclenchent aucun timer.
 *
 * Contexte Railway : un seul process Node long-vivant (app.listen) → les timers node-cron
 * vivent tant que le process vit ; ré-enregistrés au boot après un redéploiement/redémarrage.
 *
 * MULTI-INSTANCE (audit M4) — SÛR. `demarrerScheduler` enveloppe toute l'exécution dans une
 * transaction protégée par un `pg_try_advisory_xact_lock` (verrou consultatif transaction-scopé) :
 * à 2+ instances déclenchées au même cron (03:00), une seule obtient le verrou et exécute, les
 * autres passent leur tour → plus de notifications doublées. (L'anti-spam 7 jours reste un
 * `findFirst` PUIS `create` non atomique — il complète le verrou mais ne le remplace pas.)
 */

import cron from 'node-cron'
import type { FastifyInstance } from 'fastify'
import {
  calculerStatutContribution,
  type BaremeAnnuelInput,
} from './statutContribution'
import {
  creerNotification,
  estTypeActifPour,
  resoudreLangueDestinataire,
  type NotificationPrisma,
} from './notification.service'
import { notifierParPush, type PushEnAttente, type PushPrisma } from './push.service'
import { t, formatDateHeure } from '../lib/i18n'
import { orgContext } from '../lib/org-context'
import { anneeCouranteApp } from '../lib/date-app'

const JOURS_ANTISPAM = 7
const MS_PAR_JOUR = 24 * 60 * 60 * 1000

/** Surface Prisma du scheduler (mockable) : notifications + membres cotisants + barèmes. */
export interface SchedulerPrisma extends NotificationPrisma {
  notification: NotificationPrisma['notification'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(args: any): Promise<any>
  }
  membre: NotificationPrisma['membre'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<any[]>
  }
  baremeAnnuel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ annee: number; montantAttendu: number }[]>
  }
  organisation: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ id: string }[]>
  }
  reunion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ id: string; date: Date; lieu: string }[]>
  }
}

export interface VerificationRetardsResult {
  /** Nombre de membres ACTIF à compte lié examinés. */
  verifies: number
  /** Nombre de notifications COTISATION_RETARD effectivement créées. */
  notifies: number
  /** Notifications à pousser en Web Push — envoyées APRÈS le commit de la tx (cf. demarrerScheduler). */
  aPousser: PushEnAttente[]
}

/**
 * Point d'entrée MANUEL (testable) de la vérification quotidienne des retards.
 *
 * ANTI-SPAM (documenté) : on NE crée PAS de nouvelle notification COTISATION_RETARD pour un
 * membre s'il en a déjà une NON LUE créée il y a moins de 7 jours. But : ne pas re-spammer
 * la même alerte chaque jour tant que l'utilisateur ne l'a pas ouverte. Dès qu'elle est lue,
 * ou passé 7 jours, une nouvelle alerte peut repartir (rappel).
 *
 * @param anneeCourante année de référence du calcul de statut (injectée = déterministe).
 * @param now horloge injectée (base de la fenêtre anti-spam de 7 jours).
 */
export async function executerVerificationRetards(
  prisma: SchedulerPrisma,
  anneeCourante: number,
  now: Date = new Date(),
): Promise<VerificationRetardsResult> {
  const baremes: BaremeAnnuelInput[] = await prisma.baremeAnnuel.findMany({
    select: { annee: true, montantAttendu: true },
  })

  // Seuls les membres ACTIF AYANT un compte lié peuvent recevoir une notification (§4.5).
  const membres = await prisma.membre.findMany({
    where: { statut: 'ACTIF', compteUtilisateurId: { not: null } },
    select: {
      id: true,
      compteUtilisateurId: true,
      anneeAdhesion: true,
      anneeFinContribution: true,
      contributions: { select: { annee: true, montantValorise: true } },
    },
  })

  const seuilAntispam = new Date(now.getTime() - JOURS_ANTISPAM * MS_PAR_JOUR)
  let notifies = 0
  const aPousser: PushEnAttente[] = []

  for (const m of membres) {
    const { statut } = calculerStatutContribution({
      baremes,
      contributions: m.contributions,
      anneeAdhesion: m.anneeAdhesion,
      anneeFinContribution: m.anneeFinContribution ?? null,
      anneeCourante,
    })
    if (statut !== 'NON_A_JOUR') continue

    // Préférence : si l'utilisateur a désactivé COTISATION_RETARD, on ne crée rien.
    if (!(await estTypeActifPour(prisma, m.compteUtilisateurId, 'COTISATION_RETARD'))) continue

    // Anti-spam : une COTISATION_RETARD non lue de moins de 7 jours bloque un nouveau rappel.
    const recente = await prisma.notification.findFirst({
      where: {
        destinataireId: m.compteUtilisateurId,
        type: 'COTISATION_RETARD',
        lu: false,
        dateCreation: { gte: seuilAntispam },
      },
    })
    if (recente) continue

    // §4 : rappel rendu dans la langue du membre DESTINATAIRE (chacun dans sa langue).
    const langue = await resoudreLangueDestinataire(prisma, m.compteUtilisateurId)
    const titre = t(langue, 'notifications.cotisationRetard.titre')
    const message = t(langue, 'notifications.cotisationRetard.message')
    await creerNotification(prisma, {
      destinataireId: m.compteUtilisateurId,
      type: 'COTISATION_RETARD',
      titre,
      message,
      entiteType: 'Membre',
      entiteId: m.id,
    })
    aPousser.push({ destinataireId: m.compteUtilisateurId, titre, message })
    notifies += 1
  }

  return { verifies: membres.length, notifies, aPousser }
}

/** Résultat de la vérification pour une organisation donnée. */
export interface VerificationRetardsOrgResult extends VerificationRetardsResult {
  organisationId: string
}

/**
 * Vérification des retards POUR TOUTES LES ORGANISATIONS ACTIVES (SaaS §2.2).
 *
 * Tâche système sans requête HTTP → aucun contexte d'org établi par `authenticate`. Plutôt
 * qu'un `runUnscoped` global (qui mélangerait les données de toutes les orgs et fausserait le
 * calcul), on ITÈRE : chaque organisation est traitée DANS son propre contexte d'isolation,
 * de sorte que toutes les requêtes du scan (`executerVerificationRetards`) sont scopées sur
 * elle. `Organisation` est la racine (non scopée) → sa lecture ne nécessite pas de contexte.
 */
export async function executerVerificationRetardsToutesOrgs(
  prisma: SchedulerPrisma,
  anneeCourante: number,
  now: Date = new Date(),
): Promise<VerificationRetardsOrgResult[]> {
  const orgs = await prisma.organisation.findMany({ where: { actif: true }, select: { id: true } })
  const resultats: VerificationRetardsOrgResult[] = []
  for (const org of orgs) {
    // `run` avec un callback qui AWAIT à l'intérieur : le contexte ALS couvre l'exécution
    // (différée) des requêtes Prisma. Hors requête HTTP, il n'y a pas de `enterWith` préalable.
    const r = await orgContext.run({ organisationId: org.id }, async () =>
      executerVerificationRetards(prisma, anneeCourante, now),
    )
    resultats.push({ organisationId: org.id, ...r })
  }
  return resultats
}

/* -------------------------------------------------------------------------- */
/* Rappels de réunion (REUNION_RAPPEL)                                        */
/* -------------------------------------------------------------------------- */

/** Fenêtre de rappel : on prévient pour les réunions à venir dans les 48 h. */
const FENETRE_RAPPEL_JOURS = 2

export interface RappelsReunionsResult {
  /** Réunions dans la fenêtre examinées. */
  reunions: number
  /** Notifications REUNION_RAPPEL effectivement créées. */
  notifies: number
  /** Notifications à pousser en Web Push — envoyées APRÈS le commit de la tx (cf. demarrerScheduler). */
  aPousser: PushEnAttente[]
}

/**
 * Point d'entrée MANUEL (testable) des rappels de réunion pour l'organisation en contexte.
 *
 * Pour chaque réunion NON annulée dont la date tombe dans les `FENETRE_RAPPEL_JOURS` à venir,
 * on prévient CHAQUE membre ACTIF ayant un compte lié (une réunion est collective — le rappel
 * ne dépend PAS de la réponse RSVP). Dédoublonnage : une réunion déjà annoncée à ce membre
 * (une notification REUNION_RAPPEL portant `entiteId = reunion.id`) n'en regénère pas —
 * la tâche est quotidienne et la fenêtre de 48 h, donc sans ce garde une même réunion serait
 * rappelée deux nuits de suite. Préférence utilisateur respectée (REUNION_RAPPEL désactivable).
 *
 * @param now horloge injectée (borne de la fenêtre) → déterministe, testable sans cron.
 */
export async function executerRappelsReunions(
  prisma: SchedulerPrisma,
  now: Date = new Date(),
): Promise<RappelsReunionsResult> {
  const borneHaute = new Date(now.getTime() + FENETRE_RAPPEL_JOURS * MS_PAR_JOUR)
  const reunions = await prisma.reunion.findMany({
    where: { date: { gte: now, lte: borneHaute }, statut: { not: 'ANNULEE' } },
    select: { id: true, date: true, lieu: true },
    orderBy: { date: 'asc' },
  })
  if (reunions.length === 0) return { reunions: 0, notifies: 0, aPousser: [] }

  const membres = await prisma.membre.findMany({
    where: { statut: 'ACTIF', compteUtilisateurId: { not: null } },
    select: { id: true, compteUtilisateurId: true },
  })

  let notifies = 0
  const aPousser: PushEnAttente[] = []
  for (const r of reunions) {
    for (const m of membres) {
      const destinataireId = m.compteUtilisateurId as string
      if (!(await estTypeActifPour(prisma, destinataireId, 'REUNION_RAPPEL'))) continue
      // Déjà annoncée à ce membre pour CETTE réunion ? (un rappel par réunion et par membre.)
      const dejaAnnonce = await prisma.notification.findFirst({
        where: { destinataireId, type: 'REUNION_RAPPEL', entiteType: 'Reunion', entiteId: r.id },
      })
      if (dejaAnnonce) continue

      const langue = await resoudreLangueDestinataire(prisma, destinataireId)
      const titre = t(langue, 'notifications.reunionRappel.titre')
      const message = t(langue, 'notifications.reunionRappel.message', {
        date: formatDateHeure(r.date, langue),
        lieu: r.lieu,
      })
      await creerNotification(prisma, {
        destinataireId,
        type: 'REUNION_RAPPEL',
        titre,
        message,
        entiteType: 'Reunion',
        entiteId: r.id,
      })
      aPousser.push({ destinataireId, titre, message })
      notifies += 1
    }
  }
  return { reunions: reunions.length, notifies, aPousser }
}

/** Rappels de réunion POUR TOUTES LES ORGANISATIONS ACTIVES (même patron d'itération scopée). */
export async function executerRappelsReunionsToutesOrgs(
  prisma: SchedulerPrisma,
  now: Date = new Date(),
): Promise<(RappelsReunionsResult & { organisationId: string })[]> {
  const orgs = await prisma.organisation.findMany({ where: { actif: true }, select: { id: true } })
  const resultats: (RappelsReunionsResult & { organisationId: string })[] = []
  for (const org of orgs) {
    const r = await orgContext.run({ organisationId: org.id }, async () =>
      executerRappelsReunions(prisma, now),
    )
    resultats.push({ organisationId: org.id, ...r })
  }
  return resultats
}

/**
 * Enregistre le cron quotidien (03:00, Africa/Douala). À appeler UNE FOIS depuis le
 * bootstrap serveur, après app.listen. N'est jamais appelé par buildApp (donc pas en test).
 */
/** Clé du verrou consultatif Postgres protégeant la tâche de nuit (arbitraire, stable). */
const VERROU_SCHEDULER_RETARDS = 815_293_147

export function demarrerScheduler(app: FastifyInstance): void {
  cron.schedule(
    '0 3 * * *',
    () => {
      const anneeCourante = anneeCouranteApp()
      // MULTI-INSTANCE (audit M4) : toute l'exécution tourne dans UNE transaction protégée par un
      // verrou consultatif TRANSACTION-SCOPÉ (`pg_try_advisory_xact_lock`, libéré au commit, fiable
      // avec le pool contrairement à un verrou de session). Si une autre instance le détient déjà
      // (même cron à 03:00), `pg_try_advisory_xact_lock` renvoie false → cette instance PASSE son
      // tour. Timeout large (tâche de nuit, trafic quasi nul). Le cœur (`executerVerificationRetards*`)
      // reste inchangé et testable ; le verrou vit uniquement ici, au bootstrap serveur (hors tests).
      void app.prisma
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .$transaction(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (tx: any) => {
            const [{ obtenu }] = (await tx.$queryRaw`
              SELECT pg_try_advisory_xact_lock(${VERROU_SCHEDULER_RETARDS}) AS obtenu
            `) as [{ obtenu: boolean }]
            if (!obtenu) {
              app.log.info('Scheduler : verrou non obtenu (autre instance) → passage ignoré')
              return null
            }
            // Deux tâches de nuit sous LE MÊME verrou : retards de cotisation + rappels de réunion.
            const retards = await executerVerificationRetardsToutesOrgs(
              tx as SchedulerPrisma,
              anneeCourante,
            )
            const rappels = await executerRappelsReunionsToutesOrgs(tx as SchedulerPrisma)
            return { retards, rappels }
          },
          { timeout: 10 * 60 * 1000 },
        )
        .then(async (resultats) => {
          if (!resultats) return
          const { retards, rappels } = resultats
          const verifies = retards.reduce((s, r) => s + r.verifies, 0)
          const notifies = retards.reduce((s, r) => s + r.notifies, 0)
          const rappelsNotifies = rappels.reduce((s, r) => s + r.notifies, 0)
          app.log.info(
            { organisations: retards.length, verifies, notifies, rappelsNotifies },
            'Tâches de nuit terminées (retards de cotisation + rappels de réunion, toutes organisations)',
          )
          // Web Push APRÈS le commit (jamais d'HTTP dans la tx) et PAR ORG (PushSubscription est
          // scopé → contexte d'isolation requis). `app.prisma` = client NON transactionnel.
          // Best-effort : `notifierParPush` ne lève jamais. No-op si les clés VAPID sont absentes.
          for (const r of [...retards, ...rappels]) {
            if (r.aPousser.length === 0) continue
            await orgContext.run({ organisationId: r.organisationId }, async () => {
              for (const p of r.aPousser) {
                await notifierParPush(
                  app.prisma as unknown as PushPrisma,
                  app.push,
                  p.destinataireId,
                  { titre: p.titre, message: p.message, url: '/notifications' },
                )
              }
            })
          }
        })
        .catch((err) => {
          app.log.error({ err }, 'Tâches de nuit (retards + rappels de réunion) échouées')
          // Observabilité (0.1) : un scheduler qui échoue est SILENCIEUX par nature — personne
          // n'attend sa sortie, et un `log.error` à 03:00 dans Railway ne réveille personne. Il
          // pourrait échouer toutes les nuits sans que quiconque le remarque, les relances de
          // cotisation cessant simplement de partir. C'est précisément le cas que 0.1 vise.
          app.observabilite.signaler(err, {
            source: 'scheduler',
            tache: 'COTISATION_RETARD+REUNION_RAPPEL',
          })
        })
    },
    { timezone: 'Africa/Douala' },
  )
  app.log.info(
    'Scheduler notifications démarré (COTISATION_RETARD + REUNION_RAPPEL — 03:00 Africa/Douala)',
  )
}
