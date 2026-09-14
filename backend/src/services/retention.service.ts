import { orgContext } from '../lib/org-context'
import { ajouterMoisApp, debutDeJourneeApp } from '../lib/date-app'

/**
 * Purge de RÉTENTION des données techniques périssables (bloquant GA 0.3,
 * `docs/politique-retention-donnees.md` §2.4), lancée après les tâches de nuit.
 *
 * Durées annoncées par la politique : `Notification` 12 mois, `AuditLog` (tenant) 24 mois,
 * `PlatformAuditLog` 5 ans. Les tables financières ne sont jamais concernées (vie de l'organisation) ;
 * les TRACES d'audit de leurs écritures, elles, suivent la durée de l'`AuditLog`.
 *
 * Garde-fous, parce qu'une purge automatique qui se trompe détruit sans retour :
 * 1. **Par organisation, sous `orgContext.run`** — jamais un `runUnscoped` global (même règle que les
 *    autres tâches de nuit). Chaque `deleteMany` porte EN PLUS un `where.organisationId` construit ici
 *    (double filtre concordant, comme l'export self-service) : si le contexte venait à manquer,
 *    l'extension fail-close au lieu de purger tous les tenants.
 * 2. **Horloge contrôlée contre celle de Postgres** (`SELECT now()`, une autre machine) : un process
 *    dont l'horloge a sauté dans le futur calculerait des seuils trop récents et effacerait des données
 *    encore dans leur durée de conservation. Au-delà de `DERIVE_HORLOGE_MAX_MS`, la purge est refusée.
 * 3. **Seuil jamais en avance** (`seuilRetention`) : début du jour calendaire Douala situé `mois` mois
 *    plus tôt — une ligne est conservée AU MOINS sa durée entière (jusqu'à un jour de plus), jamais une
 *    heure de moins. Durée < 12 mois ou date invalide → refus.
 * 4. **`PlatformAuditLog` n'est PAS scopé** (journal transverse, aucun `organisationId`) : sa purge ne
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

/** Écart toléré entre l'horloge du process et celle de Postgres. */
export const DERIVE_HORLOGE_MAX_MS = 5 * 60 * 1000

export class RetentionRefuseeError extends Error {
  constructor(motif: string) {
    super(`Purge de rétention refusée : ${motif}`)
    this.name = 'RetentionRefuseeError'
  }
}

/**
 * Instant avant lequel une ligne est expirée : début (00:00 Douala) du jour situé `mois` mois avant
 * `now`. Lève si `now` est invalide ou si la durée descend sous le plancher.
 */
export function seuilRetention(now: Date, mois: number): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RetentionRefuseeError('date invalide')
  if (!Number.isInteger(mois) || mois < PLANCHER_MOIS) throw new RetentionRefuseeError(`durée de ${mois} mois`)
  return debutDeJourneeApp(ajouterMoisApp(now, -mois))
}

type DeleteManyArgs = { where: Record<string, unknown> }
type DeleteMany = (args: DeleteManyArgs) => Promise<{ count: number }>

export interface RetentionPrisma {
  $queryRaw: (requete: TemplateStringsArray, ...valeurs: unknown[]) => Promise<unknown>
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

/** Refuse si l'horloge du process s'écarte de celle de Postgres au-delà de la tolérance. */
async function verifierHorloge(prisma: RetentionPrisma, now: Date): Promise<void> {
  // Époque en millisecondes, pas `now()` brut : l'adaptateur relit un `timestamptz` comme une heure
  // locale et le décale du fuseau de session Postgres (vu : +2 h sous Europe/Paris).
  const lignes = (await prisma.$queryRaw`SELECT (extract(epoch FROM now()) * 1000)::float8 AS ms`) as { ms: unknown }[]
  const base = lignes[0]?.ms
  if (typeof base !== 'number' || !Number.isFinite(base)) {
    throw new RetentionRefuseeError('horloge de la base illisible')
  }
  if (Math.abs(now.getTime() - base) > DERIVE_HORLOGE_MAX_MS) {
    throw new RetentionRefuseeError('horloge du process trop éloignée de celle de la base')
  }
}

/** Purge de l'organisation EN CONTEXTE (appelée sous `orgContext.run`). */
export async function purgerRetentionOrganisation(
  prisma: RetentionPrisma,
  organisationId: string,
  now: Date,
): Promise<Omit<RetentionOrganisationResult, 'organisationId'>> {
  const notifications = await prisma.notification.deleteMany({
    where: { organisationId, dateCreation: { lt: seuilRetention(now, RETENTION_MOIS.notification) } },
  })
  const auditLogs = await prisma.auditLog.deleteMany({
    where: { organisationId, dateAction: { lt: seuilRetention(now, RETENTION_MOIS.auditLog) } },
  })
  return { notifications: notifications.count, auditLogs: auditLogs.count }
}

/**
 * Purge de rétention de TOUTES les organisations (actives ou suspendues : la durée de conservation
 * ne dépend pas de l'état de l'abonnement), puis du journal plateforme.
 */
export async function purgerRetention(prisma: RetentionPrisma, now: Date = new Date()): Promise<RetentionResult> {
  // Tout est validé AVANT la première suppression : seuils (date, durées) puis horloge.
  const seuilPlateforme = seuilRetention(now, RETENTION_MOIS.platformAuditLog)
  for (const mois of Object.values(RETENTION_MOIS)) seuilRetention(now, mois)
  await verifierHorloge(prisma, now)

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
