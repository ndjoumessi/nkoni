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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(args?: any): Promise<number>
  }
}

/** Réponse bornée : les statuts calculés + le total réel + un drapeau de troncature (audit m4). */
export interface StatutsMembresResultat {
  items: MembreAvecStatut[]
  total: number
  tronque: boolean
}

/**
 * Plafond du nombre de membres renvoyés par `/membres/statuts` (audit m4 : borne la réponse
 * pour ne pas sérialiser une liste illimitée sur un gros forfait). Généreux : aucune org réelle
 * ne l'approche ; au-delà, `tronque` le signale (une vraie pagination serveur avec recherche
 * viendra quand une org PRO dépassera ce volume — elle exige de matérialiser le statut calculé).
 */
export const PLAFOND_STATUTS_MEMBRES = 1000

/**
 * Charge les membres (filtrés par `where` si fourni — ex. restriction MEMBRE_SIMPLE à sa propre
 * fiche), BORNÉS à `limite`, et leur associe leur statut de cotisation cumulatif. Une requête
 * membres + une requête barèmes + un `count` (total réel) ; le calcul de statut est en mémoire.
 */
export async function calculerStatutsMembres(
  prisma: MembreStatutPrisma,
  anneeCourante: number,
  where?: Record<string, unknown>,
  limite?: number,
): Promise<StatutsMembresResultat> {
  const [baremes, total, membres] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: { annee: true, montantAttendu: true } }),
    prisma.membre.count(where ? { where } : undefined),
    prisma.membre.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      ...(limite != null ? { take: limite } : {}),
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

  const items = membres.map((m) => {
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
  return { items, total, tronque: limite != null && total > limite }
}
