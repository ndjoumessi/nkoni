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
 * En cas de scaling multi-instance, la tâche tournerait sur chaque instance, mais l'anti-spam
 * 7 jours rend l'opération IDEMPOTENTE (pas de doublon de notification) → sûr même ainsi.
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
import { t } from '../lib/i18n'
import { orgContext } from '../lib/org-context'

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
}

export interface VerificationRetardsResult {
  /** Nombre de membres ACTIF à compte lié examinés. */
  verifies: number
  /** Nombre de notifications COTISATION_RETARD effectivement créées. */
  notifies: number
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
    await creerNotification(prisma, {
      destinataireId: m.compteUtilisateurId,
      type: 'COTISATION_RETARD',
      titre: t(langue, 'notifications.cotisationRetard.titre'),
      message: t(langue, 'notifications.cotisationRetard.message'),
      entiteType: 'Membre',
      entiteId: m.id,
    })
    notifies += 1
  }

  return { verifies: membres.length, notifies }
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

/**
 * Enregistre le cron quotidien (03:00, Africa/Douala). À appeler UNE FOIS depuis le
 * bootstrap serveur, après app.listen. N'est jamais appelé par buildApp (donc pas en test).
 */
export function demarrerScheduler(app: FastifyInstance): void {
  cron.schedule(
    '0 3 * * *',
    () => {
      const anneeCourante = new Date().getFullYear()
      void executerVerificationRetardsToutesOrgs(
        app.prisma as unknown as SchedulerPrisma,
        anneeCourante,
      )
        .then((resultats) => {
          const verifies = resultats.reduce((s, r) => s + r.verifies, 0)
          const notifies = resultats.reduce((s, r) => s + r.notifies, 0)
          app.log.info(
            { organisations: resultats.length, verifies, notifies },
            'Vérification quotidienne des retards de cotisation terminée (toutes organisations)',
          )
        })
        .catch((err) =>
          app.log.error({ err }, 'Vérification des retards de cotisation échouée'),
        )
    },
    { timezone: 'Africa/Douala' },
  )
  app.log.info('Scheduler notifications démarré (COTISATION_RETARD — 03:00 Africa/Douala)')
}
