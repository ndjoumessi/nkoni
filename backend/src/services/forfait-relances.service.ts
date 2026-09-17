/**
 * Relances d'ÉCHÉANCE du forfait (spec 1.1 §4.1) — tâche de nuit, branchée dans `demarrerScheduler`.
 *
 * Pour chaque organisation active dont le forfait PAYANT a une échéance, l'étape la plus récente atteinte
 * (`etapeRelanceForfait` : J-30, J-7, J-1, entrée en grâce) est notifiée aux comptes ADMIN et PRESIDENT
 * actifs — jamais aux autres rôles, jamais aux membres : c'est une affaire commerciale entre NKONI et le
 * bureau. Trois invariants :
 *   - DÉDOUBLONNAGE par `entiteId = <org>#<échéance ISO>#<étape>` (motif de REUNION_RAPPEL) : une étape
 *     part une fois ; une prolongation change l'échéance, donc la clé, et le cycle se RÉARME seul.
 *   - AVIS DE SERVICE : aucune préférence consultée (`FORFAIT_ECHEANCE` n'est pas désactivable).
 *   - AUCUN envoi HTTP ici : on COLLECTE push et e-mails, livrés APRÈS le commit de la transaction de
 *     nuit par `livrerRelancesForfait` (jamais d'appel réseau dans une transaction).
 */
import {
  etapeRelanceForfait,
  vueEcheance,
  type EtapeRelanceForfait,
  type Forfait,
} from '../lib/forfait'
import { formatDateApp, t, type Langue } from '../lib/i18n'
import { orgContext } from '../lib/org-context'
import {
  creerNotification,
  resoudreLangueDestinataire,
  type NotificationPrisma,
} from './notification.service'
import {
  notifierParPush,
  type PushClient,
  type PushEnAttente,
  type PushObservabilite,
  type PushPrisma,
} from './push.service'
import { envoyerMessageEmail, type EmailClient } from './email.service'

/** Destinataires des relances. Miroir front : `GESTION_FORFAIT` (lib/roles.ts), garde `roles-parity`. */
export const ROLES_RELANCE_FORFAIT = ['ADMIN', 'PRESIDENT'] as const

export interface OrganisationRelance {
  id: string
  nom: string
  forfait: Forfait
  forfaitExpireLe: Date | null
}

/** Un e-mail à envoyer APRÈS le commit. */
export interface EmailEnAttente {
  email: string
  sujet: string
  texte: string
}

export interface RelancesForfaitResult {
  organisationId: string
  /** Étape atteinte, `null` si rien à relancer. */
  etape: EtapeRelanceForfait | null
  /** Notifications effectivement créées cette nuit. */
  notifies: number
  aPousser: PushEnAttente[]
  aEnvoyer: EmailEnAttente[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Surface Prisma (mockable). `utilisateur` est SCOPÉ : appelé sous `orgContext.run`. */
export interface RelancesForfaitPrisma extends NotificationPrisma {
  notification: NotificationPrisma['notification'] & { findFirst(args: any): Promise<any> }
  utilisateur: NotificationPrisma['utilisateur'] & {
    findMany(args: any): Promise<{ id: string; email: string }[]>
  }
  organisation: { findMany(args: any): Promise<OrganisationRelance[]> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Clé de dédoublonnage d'une étape pour une échéance donnée. */
export function cleRelanceForfait(
  organisationId: string,
  expireLe: Date,
  etape: EtapeRelanceForfait,
): string {
  return `${organisationId}#${expireLe.toISOString()}#${etape}`
}

const CLE_NOM_FORFAIT = {
  GRATUIT: 'notifications.forfaits.GRATUIT',
  PRO: 'notifications.forfaits.PRO',
  ENTREPRISE: 'notifications.forfaits.ENTREPRISE',
} as const

const CLE_MESSAGE = {
  J30: 'notifications.forfaitEcheance.J30',
  J7: 'notifications.forfaitEcheance.J7',
  J1: 'notifications.forfaitEcheance.J1',
  GRACE: 'notifications.forfaitEcheance.GRACE',
} as const

function rediger(
  langue: Langue,
  etape: EtapeRelanceForfait,
  org: OrganisationRelance & { forfaitExpireLe: Date },
  now: Date,
): { titre: string; message: string } {
  const vue = vueEcheance(org.forfait, org.forfaitExpireLe, now)
  return {
    titre: t(langue, 'notifications.forfaitEcheance.titre', { organisation: org.nom }),
    message: t(langue, CLE_MESSAGE[etape], {
      forfait: t(langue, CLE_NOM_FORFAIT[org.forfait]),
      organisation: org.nom,
      date: formatDateApp(org.forfaitExpireLe, langue),
      jours: vue.joursRestants ?? 0,
      fin: vue.finGraceLe ? formatDateApp(vue.finGraceLe, langue) : '',
    }),
  }
}

/**
 * Relances de l'organisation EN CONTEXTE (appelée sous `orgContext.run`). `now` injecté → déterministe.
 */
export async function executerRelancesForfait(
  prisma: RelancesForfaitPrisma,
  org: OrganisationRelance,
  now: Date = new Date(),
): Promise<RelancesForfaitResult> {
  const etape = etapeRelanceForfait(org.forfait, org.forfaitExpireLe, now)
  const resultat: RelancesForfaitResult = {
    organisationId: org.id,
    etape: null,
    notifies: 0,
    aPousser: [],
    aEnvoyer: [],
  }
  if (etape === null || org.forfaitExpireLe === null) return resultat
  resultat.etape = etape

  const entiteId = cleRelanceForfait(org.id, org.forfaitExpireLe, etape)
  const destinataires = await prisma.utilisateur.findMany({
    where: { role: { in: [...ROLES_RELANCE_FORFAIT] }, actif: true },
    select: { id: true, email: true },
  })

  for (const u of destinataires) {
    const deja = await prisma.notification.findFirst({
      where: { destinataireId: u.id, type: 'FORFAIT_ECHEANCE', entiteType: 'Organisation', entiteId },
    })
    if (deja) continue

    const langue = await resoudreLangueDestinataire(prisma, u.id)
    const { titre, message } = rediger(langue, etape, { ...org, forfaitExpireLe: org.forfaitExpireLe }, now)
    await creerNotification(prisma, {
      destinataireId: u.id,
      type: 'FORFAIT_ECHEANCE',
      titre,
      message,
      entiteType: 'Organisation',
      entiteId,
    })
    resultat.aPousser.push({ destinataireId: u.id, titre, message })
    resultat.aEnvoyer.push({
      email: u.email,
      sujet: titre,
      texte: `${message}\n\n${t(langue, 'notifications.forfaitEcheance.pied')}`,
    })
    resultat.notifies += 1
  }
  return resultat
}

/**
 * Relances POUR TOUTES LES ORGANISATIONS actives à forfait payant daté (même patron d'itération scopée
 * que les autres tâches de nuit : jamais un `runUnscoped` global). `Organisation` n'est pas scopée :
 * sa lecture ne demande pas de contexte.
 */
export async function executerRelancesForfaitToutesOrgs(
  prisma: RelancesForfaitPrisma,
  now: Date = new Date(),
): Promise<RelancesForfaitResult[]> {
  // `estDemo: false` : jamais d'e-mail de relance au compte fictif de la démo (spec 2026-09-15 §1.5).
  const orgs = await prisma.organisation.findMany({
    where: { actif: true, estDemo: false, forfait: { not: 'GRATUIT' }, forfaitExpireLe: { not: null } },
    select: { id: true, nom: true, forfait: true, forfaitExpireLe: true },
  })
  const resultats: RelancesForfaitResult[] = []
  for (const org of orgs) {
    const r = await orgContext.run({ organisationId: org.id }, async () =>
      executerRelancesForfait(prisma, org, now),
    )
    resultats.push(r)
  }
  return resultats
}

/**
 * Livraison APRÈS le commit de la transaction de nuit : Web Push (par organisation, sous son contexte :
 * `PushSubscription` est scopé) puis e-mails. Ne lève JAMAIS : `notifierParPush` et
 * `envoyerMessageEmail` sont best-effort, et les notifications sont déjà en base — un envoi raté ne
 * doit pas faire croire que la relance n'a pas eu lieu.
 */
export async function livrerRelancesForfait(
  deps: {
    prisma: PushPrisma
    push: PushClient
    email: EmailClient
    observabilite?: PushObservabilite
  },
  resultats: RelancesForfaitResult[],
): Promise<{ emailsEnvoyes: number }> {
  let emailsEnvoyes = 0
  for (const r of resultats) {
    if (r.aPousser.length > 0) {
      await orgContext.run({ organisationId: r.organisationId }, async () => {
        for (const p of r.aPousser) {
          await notifierParPush(
            deps.prisma,
            deps.push,
            p.destinataireId,
            { titre: p.titre, message: p.message, url: '/parametres' },
            deps.observabilite,
          )
        }
      })
    }
    for (const e of r.aEnvoyer) {
      if (await envoyerMessageEmail(deps.email, e.email, e.sujet, e.texte)) {
        emailsEnvoyes += 1
      } else if (deps.email.disponible() && deps.observabilite) {
        // Canal configuré mais l'envoi a échoué : sans ce signalement la relance ne partait nulle
        // part en silence (le client e-mail avale l'erreur). Aucun destinataire dans le contexte.
        deps.observabilite.signaler(new Error('Relance de forfait non envoyée (email)'), {
          source: 'envoi',
          canal: 'email',
          envoi: 'relanceForfait',
          organisationId: r.organisationId,
        })
      }
    }
  }
  return { emailsEnvoyes }
}
