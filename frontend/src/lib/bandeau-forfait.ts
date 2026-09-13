import type { OrganisationCourante } from '@/lib/api'

/**
 * Règle d'AFFICHAGE du bandeau d'échéance (spec 1.1 §4.4). Aucune règle de calcul : l'état et les jours
 * restants viennent du serveur (`GET /organisations/moi`). Fichier séparé du composant (Fast Refresh).
 */

/** En deçà (inclus) de ce nombre de jours, l'échéance proche s'affiche en bandeau ; avant, la notification suffit. */
export const JOURS_BANDEAU_PROCHE = 7

export interface BandeauForfaitVue {
  cle: 'proche' | 'grace' | 'expire'
  ton: 'info' | 'or' | 'neutre'
  /** Fermable pour la session ; la grâce ne l'est jamais (spec). */
  fermable: boolean
  /** Clé de fermeture : change avec l'échéance ET l'état, pour qu'un nouvel état se ré-affiche. */
  idFermeture: string
}

type OrgBandeau = Pick<OrganisationCourante, 'id' | 'forfait' | 'forfaitExpireLe' | 'etatForfait' | 'joursRestants'>

export function bandeauForfait(org: OrgBandeau): BandeauForfaitVue | null {
  // `== null` : une API pas encore déployée renvoie `undefined` pour ces champs.
  if (org.etatForfait == null || org.forfaitExpireLe == null) return null
  const idFermeture = `nkoni:bandeau-forfait:${org.id}:${org.forfaitExpireLe}:${org.etatForfait}`
  switch (org.etatForfait) {
    case 'ECHEANCE_PROCHE':
      return org.joursRestants != null && org.joursRestants <= JOURS_BANDEAU_PROCHE
        ? { cle: 'proche', ton: 'info', fermable: true, idFermeture }
        : null
    case 'GRACE':
      return { cle: 'grace', ton: 'or', fermable: false, idFermeture }
    case 'EXPIRE':
      return org.forfait !== 'GRATUIT' ? { cle: 'expire', ton: 'neutre', fermable: true, idFermeture } : null
    default:
      return null
  }
}

/** Le bandeau a-t-il été fermé dans cette session ? Accès au stockage protégé (navigation privée, blocage). */
export function estBandeauFerme(id: string): boolean {
  try {
    return sessionStorage.getItem(id) === '1'
  } catch {
    return false
  }
}

export function fermerBandeau(id: string): void {
  try {
    sessionStorage.setItem(id, '1')
  } catch {
    // Stockage indisponible : la fermeture vaut pour l'affichage courant seulement.
  }
}
