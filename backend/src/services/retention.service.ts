import { orgContext } from '../lib/org-context'
import { ajouterMoisApp } from '../lib/date-app'

/**
 * Purge de RÉTENTION des données techniques périssables (bloquant GA 0.3,
 * `docs/politique-retention-donnees.md` §2.4), branchée dans la tâche de nuit.
 *
 * Durées annoncées par la politique : `Notification` 12 mois, `AuditLog` (tenant) 24 mois,
 * `PlatformAuditLog` 5 ans. Les données FINANCIÈRES ne sont jamais concernées (vie de l'organisation).
 *
 * Trois garde-fous, parce qu'une purge automatique qui se trompe détruit sans retour :
 * 1. **Par organisation, sous `orgContext.run`** — jamais un `runUnscoped` global (même règle que les
 *    autres tâches de nuit). Chaque `deleteMany` porte EN PLUS un `where.organisationId` construit ici
 *    (double filtre concordant, comme l'export self-service) : si le contexte venait à manquer,
 *    l'extension fail-close au lieu de purger tous les tenants.
 * 2. **Seuil borné** (`seuilRetention`) : une horloge aberrante (date future, `Invalid Date`) ne doit
 *    jamais produire un seuil récent qui effacerait des données encore dans leur durée de conservation.
 * 3. **`PlatformAuditLog` n'est PAS scopé** (journal transverse, aucun `organisationId`) : sa purge ne
 *    passe pas par l'extension, d'où un `where` sur la seule date, construit ici, jamais vide.
 *
 * Effet sur les dédoublonnages qui lisent l'EXISTENCE d'une notification : aucun. `COTISATION_RETARD`
 * regarde les 7 derniers jours, `REUNION_RAPPEL` des réunions à 48 h, `FORFAIT_ECHEANCE` des étapes
 * qui cessent 14 jours après l'échéance — toutes très en deçà de 12 mois.
 */

export const RETENTION_MOIS = {
  notification: 12,
  auditLog: 24,
  platformAuditLog: 60,
} as const

/** Aucune durée de rétention ne descend sous ce plancher : protège contre une constante mal saisie. */
const PLANCHER_MOIS = 12

export class HorlogeRetentionInvalideError extends Error {
  constructor() {
    super('Horloge de rétention invalide : purge refusée')
    this.name = 'HorlogeRetentionInvalideError'
  }
}

/**
 * Instant avant lequel une ligne est expirée. Lève si `now` est invalide ou si la durée demandée
 * descend sous le plancher — une purge refusée vaut mieux qu'une purge trop large.
 */
export function seuilRetention(now: Date, mois: number): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new HorlogeRetentionInvalideError()
  if (!Number.isInteger(mois) || mois < PLANCHER_MOIS) throw new HorlogeRetentionInvalideError()
  return ajouterMoisApp(now, -mois)
}

type DeleteManyArgs = { where: Record<string, unknown> }
type DeleteMany = (args: DeleteManyArgs) => Promise<{ count: number }>

export interface RetentionPrisma {
  organisation: { findMany: (args: { select: { id: true } }) => Promise<{ id: string }[]> }
  notification: { deleteMany: DeleteMany }
  auditLog: { deleteMany: DeleteMany }
  platformAuditLog: { deleteMany: DeleteMany }
}

export interface RetentionOrganisationResult {
  organisationId: string
  notifications: number
  auditLogs: number
}

export interface RetentionResult {
  organisations: RetentionOrganisationResult[]
  platformAuditLogs: number
}

/** Purge de l'organisation EN CONTEXTE (appelée sous `orgContext.run`). */
export async function purgerRetentionOrganisation(
  prisma: RetentionPrisma,
  organisationId: string,
  now: Date,
): Promise<Omit<RetentionOrganisationResult, 'organisationId'>> {
  const seuilNotifications = seuilRetention(now, RETENTION_MOIS.notification)
  const seuilAudit = seuilRetention(now, RETENTION_MOIS.auditLog)
  const notifications = await prisma.notification.deleteMany({
    where: { organisationId, dateCreation: { lt: seuilNotifications } },
  })
  const auditLogs = await prisma.auditLog.deleteMany({
    where: { organisationId, dateAction: { lt: seuilAudit } },
  })
  return { notifications: notifications.count, auditLogs: auditLogs.count }
}

/**
 * Purge de rétention de TOUTES les organisations (actives ou suspendues : la durée de conservation
 * ne dépend pas de l'état de l'abonnement), puis du journal plateforme.
 */
export async function purgerRetention(prisma: RetentionPrisma, now: Date = new Date()): Promise<RetentionResult> {
  // Seuils calculés AVANT toute suppression : une horloge invalide refuse la purge entière.
  const seuilPlateforme = seuilRetention(now, RETENTION_MOIS.platformAuditLog)
  seuilRetention(now, RETENTION_MOIS.notification)
  seuilRetention(now, RETENTION_MOIS.auditLog)

  const orgs = await prisma.organisation.findMany({ select: { id: true } })
  const organisations: RetentionOrganisationResult[] = []
  for (const org of orgs) {
    const r = await orgContext.run({ organisationId: org.id }, async () =>
      purgerRetentionOrganisation(prisma, org.id, now),
    )
    organisations.push({ organisationId: org.id, ...r })
  }
  const plateforme = await prisma.platformAuditLog.deleteMany({
    where: { dateAction: { lt: seuilPlateforme } },
  })
  return { organisations, platformAuditLogs: plateforme.count }
}
