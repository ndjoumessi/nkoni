/**
 * Service « membres avec statut de cotisation » — NKONI.
 *
 * Sert la liste des membres enrichie de leur statut cumulatif (A_JOUR/PARTIEL/NON_A_JOUR)
 * calculé EN MASSE en une seule passe, pour éviter le N+1 qu'imposerait un appel
 * `GET /membres/:id/statut` par membre côté frontend (100+ membres possibles).
 *
 * Réutilise la fonction pure `calculerStatutContribution` (§4.1) — même règle de vérité que
 * `GET /membres/:id/statut` et que le dashboard : aucun statut n'est stocké, tout est
 * recalculé à partir des `montantValorise` courants.
 */

import {
  calculerStatutContribution,
  type StatutContributionValue,
} from './statutContribution'

export type StatutMembreValue = 'ACTIF' | 'INACTIF' | 'DECEDE'

export interface MembreAvecStatut {
  id: string
  nom: string
  prenom: string
  sexe: string | null
  statut: StatutMembreValue
  telephone: string | null
  brancheId: string | null
  branche: { id: string; nom: string } | null
  anneeAdhesion: number
  anneeFinContribution: number | null
  statutCotisation: StatutContributionValue
  totalAttenduCumule: number
  totalValoriseCumule: number
}

export interface MembreStatutPrisma {
  baremeAnnuel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ annee: number; montantAttendu: number }[]>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<any[]>
  }
}

/**
 * Charge tous les membres (filtrés par `where` si fourni — ex. restriction MEMBRE_SIMPLE à
 * sa propre fiche) et leur associe leur statut de cotisation cumulatif. Une seule requête
 * membres + une requête barèmes ; le calcul de statut est purement en mémoire.
 */
export async function calculerStatutsMembres(
  prisma: MembreStatutPrisma,
  anneeCourante: number,
  where?: Record<string, unknown>,
): Promise<MembreAvecStatut[]> {
  const [baremes, membres] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: { annee: true, montantAttendu: true } }),
    prisma.membre.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      select: {
        id: true,
        nom: true,
        prenom: true,
        sexe: true,
        statut: true,
        telephone: true,
        brancheId: true,
        branche: { select: { id: true, nom: true } },
        anneeAdhesion: true,
        anneeFinContribution: true,
        contributions: { select: { annee: true, montantValorise: true } },
      },
    }),
  ])

  return membres.map((m) => {
    const r = calculerStatutContribution({
      baremes,
      contributions: m.contributions,
      anneeAdhesion: m.anneeAdhesion,
      anneeFinContribution: m.anneeFinContribution ?? null,
      anneeCourante,
    })
    return {
      id: m.id,
      nom: m.nom,
      prenom: m.prenom,
      sexe: m.sexe ?? null,
      statut: m.statut,
      telephone: m.telephone ?? null,
      brancheId: m.brancheId ?? null,
      branche: m.branche ?? null,
      anneeAdhesion: m.anneeAdhesion,
      anneeFinContribution: m.anneeFinContribution ?? null,
      statutCotisation: r.statut,
      totalAttenduCumule: r.totalAttenduCumule,
      totalValoriseCumule: r.totalValoriseCumule,
    }
  })
}
