import { peutVoirConflit, type ConflitAcces } from './conflit.service'
import type { Role } from '../middlewares/permissions'

/**
 * V2 (§5) — Lecture du journal d'audit. GET /audit-log est réservé ADMIN, mais la
 * confidentialité par-entrée est appliquée ici (réutilisable/testable) : une entrée
 * CONFLIT n'est visible que par ceux qui pourraient voir ce conflit (peutVoirConflit),
 * évalué sur les MÉTADONNÉES non sensibles du snapshot (héritage de confidentialité §4.4).
 */

export interface DemandeurAudit {
  id?: string
  role: Role
}

export interface FiltresAudit {
  entiteType?: string
  entiteId?: string
  acteurId?: string
  dateDebut?: string
  dateFin?: string
  page?: number
  limite?: number
}

export const LIMITE_DEFAUT = 50
export const LIMITE_MAX = 200

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AuditPrisma {
  auditLog: {
    findMany(args: any): Promise<any[]>
    count(args: any): Promise<number>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function construireWhere(f: FiltresAudit): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  if (f.entiteType) where['entiteType'] = f.entiteType
  if (f.entiteId) where['entiteId'] = f.entiteId
  if (f.acteurId) where['acteurId'] = f.acteurId
  if (f.dateDebut || f.dateFin) {
    const plage: Record<string, Date> = {}
    if (f.dateDebut) plage['gte'] = new Date(f.dateDebut)
    if (f.dateFin) plage['lte'] = new Date(f.dateFin)
    where['dateAction'] = plage
  }
  return where
}

/** Reconstruit l'accès Conflit depuis le snapshot (métadonnées) d'une entrée d'audit. */
function conflitDepuisSnapshot(entry: {
  donneesAvant?: unknown
  donneesApres?: unknown
}): ConflitAcces | null {
  const snap = (entry.donneesApres ?? entry.donneesAvant) as Record<string, unknown> | null
  if (!snap || typeof snap !== 'object' || !snap['niveauConfidentialite']) return null
  return {
    niveauConfidentialite: snap['niveauConfidentialite'] as ConflitAcces['niveauConfidentialite'],
    auteurId: (snap['auteurId'] as string) ?? '',
    responsableSuiviId: (snap['responsableSuiviId'] as string | null) ?? null,
  }
}

/**
 * Une entrée d'audit est-elle visible par `u` ? Pour `entiteType === 'Conflit'`, on
 * réapplique peutVoirConflit (héritage de confidentialité). Les autres types n'ont pas
 * de règle par-enregistrement (la lecture du journal est déjà réservée ADMIN).
 */
export function peutVoirEntreeAudit(
  entry: { entiteType: string; donneesAvant?: unknown; donneesApres?: unknown },
  u: DemandeurAudit,
): boolean {
  if (entry.entiteType !== 'Conflit') return true
  const conflit = conflitDepuisSnapshot(entry)
  // Métadonnées absentes (cas défensif) → réservé à l'ADMIN.
  if (!conflit) return u.role === 'ADMIN'
  return peutVoirConflit(conflit, u)
}

/**
 * Liste paginée du journal d'audit, filtrée par les critères ET par la confidentialité
 * héritée (entrées CONFLIT non visibles retirées de la page).
 */
export async function listerAuditLog(
  prisma: AuditPrisma,
  filtres: FiltresAudit,
  u: DemandeurAudit,
) {
  const where = construireWhere(filtres)
  const page = Math.max(1, Math.floor(filtres.page ?? 1))
  const limite = Math.min(LIMITE_MAX, Math.max(1, Math.floor(filtres.limite ?? LIMITE_DEFAUT)))

  const [total, brut] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { dateAction: 'desc' },
      skip: (page - 1) * limite,
      take: limite,
      include: { acteur: { select: { id: true, email: true, role: true } } },
    }),
  ])

  const donnees = brut.filter((e) => peutVoirEntreeAudit(e, u))
  return { donnees, page, limite, total }
}
