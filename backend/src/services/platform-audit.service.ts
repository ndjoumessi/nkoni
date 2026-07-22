/**
 * Service — journal d'audit PLATEFORME (dette roadmap 0.3).
 *
 * Écrit une entrée `PlatformAuditLog` (NON scopé, §2.3) à chaque action du SUPER_ADMIN sur une
 * organisation. Tout est SNAPSHOT au moment de l'action : `acteurEmail` (résolu ici, absent du
 * token JWT) et `organisationNom` restent lisibles même après renommage/suppression de l'acteur ou
 * purge de l'org. La ligne SURVIT à la purge du tenant (aucune relation vers `Organisation`).
 *
 * Appelé DANS le `runUnscoped` des handlers (`platform.route.ts`) — le modèle étant hors
 * `SCOPED_MODELS`, l'écriture passe l'extension d'isolation sans contexte.
 *
 * Deux contrats de fiabilité côté APPELANT (cf. platform.route.ts) : best-effort pour
 * CHANGER_FORFAIT/SUSPENDRE/REACTIVER/EXPORTER (n'échoue jamais l'action), FAIL-CLOSED pour PURGER
 * (journalisé AVANT la transaction : si l'écriture lève, l'org n'est PAS purgée — pas de trace, pas
 * de destruction). Ce service ne connaît pas ces contrats : il lève simplement en cas d'échec, et
 * c'est l'appelant qui décide de rattraper (best-effort) ou de propager (fail-closed).
 */

export type ActionPlateforme = 'CHANGER_FORFAIT' | 'SUSPENDRE' | 'REACTIVER' | 'PURGER' | 'EXPORTER'

/** Surface Prisma minimale (mockable en test). */
export interface PlatformAuditPrisma {
  utilisateur: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<{ email: string } | null>
  }
  platformAuditLog: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<unknown>
  }
}

export interface JournalActionParams {
  acteurId: string
  action: ActionPlateforme
  organisationCibleId: string
  /** Nom de l'org FIGÉ à l'action (l'org peut être purgée ensuite). */
  organisationNom: string
  donneesAvant?: unknown
  donneesApres?: unknown
}

/**
 * Journalise une action plateforme. Résout `acteurEmail` par lecture de l'acteur (le token JWT ne
 * le porte pas) et l'écrit en snapshot ; repli `(inconnu)` si l'acteur est introuvable — ne bloque
 * jamais l'écriture de la trace elle-même.
 */
export async function journaliserActionPlateforme(
  prisma: PlatformAuditPrisma,
  params: JournalActionParams,
): Promise<void> {
  const acteur = await prisma.utilisateur.findUnique({
    where: { id: params.acteurId },
    select: { email: true },
  })
  await prisma.platformAuditLog.create({
    data: {
      acteurId: params.acteurId,
      acteurEmail: acteur?.email ?? '(inconnu)',
      action: params.action,
      organisationCibleId: params.organisationCibleId,
      organisationNom: params.organisationNom,
      // Json nullable : une valeur présente est stockée telle quelle, `undefined` omis → NULL.
      donneesAvant: params.donneesAvant ?? undefined,
      donneesApres: params.donneesApres ?? undefined,
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Lecture (vue « Historique plateforme »)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Plafond de lecture du journal (même logique que `PLAFOND_STATUTS_MEMBRES`) : on borne la réponse
 * pour ne pas sérialiser un journal illimité. Généreux ; au-delà, `tronque` le signale et la page
 * l'affiche. Une vraie pagination viendra si le volume l'exige.
 */
export const PLAFOND_JOURNAL_PLATEFORME = 200

export interface JournalPlateformeEntree {
  id: string
  acteurId: string
  acteurEmail: string
  action: ActionPlateforme
  organisationCibleId: string
  organisationNom: string
  donneesAvant: unknown
  donneesApres: unknown
  dateAction: Date
}

export interface JournalPlateformeResultat {
  items: JournalPlateformeEntree[]
  total: number
  /** `true` si le total dépasse la limite : la page affiche une bannière de troncature. */
  tronque: boolean
}

/** Surface Prisma de lecture (mockable). */
export interface JournalPlateformeReadPrisma {
  platformAuditLog: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(args?: any): Promise<number>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<JournalPlateformeEntree[]>
  }
}

/**
 * Liste le journal plateforme, filtré par action et/ou organisation ciblée, trié du plus récent au
 * plus ancien, BORNÉ à `limite`. `total` est le décompte réel (non borné) ; `tronque = total > limite`.
 */
export async function listerJournalPlateforme(
  prisma: JournalPlateformeReadPrisma,
  // `| undefined` explicite : la route passe directement les valeurs de querystring (optionnelles).
  filtre: { action?: ActionPlateforme | undefined; organisationCibleId?: string | undefined } = {},
  limite: number = PLAFOND_JOURNAL_PLATEFORME,
): Promise<JournalPlateformeResultat> {
  const where = {
    ...(filtre.action ? { action: filtre.action } : {}),
    ...(filtre.organisationCibleId ? { organisationCibleId: filtre.organisationCibleId } : {}),
  }
  const [total, items] = await Promise.all([
    prisma.platformAuditLog.count({ where }),
    prisma.platformAuditLog.findMany({ where, orderBy: { dateAction: 'desc' }, take: limite }),
  ])
  return { items, total, tronque: total > limite }
}
