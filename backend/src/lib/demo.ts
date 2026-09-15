/**
 * Espace de démonstration partagé (spec 2026-09-15 §1.4) — ce qu'un jeton `demo` peut faire.
 *
 * Règle PURE, appliquée par `authenticate` (toutes les routes tenant y passent) : une démo se
 * CONSULTE. Toute méthode autre que GET/HEAD est refusée, sauf les rares routes POST qui ne font
 * que calculer, listées ci-dessous par « MÉTHODE motif-de-route » exact (jamais un préfixe :
 * `POST /equilibrages` applique réellement un équilibrage).
 *
 * Ajouter une exception = prouver qu'elle n'écrit RIEN (ni base, ni Blob, ni envoi) : le test
 * `demo.test.ts` fige la liste pour forcer cette relecture.
 */

const METHODES_LECTURE = new Set(['GET', 'HEAD'])

export const ECRITURES_AUTORISEES_EN_DEMO: readonly string[] = ['POST /equilibrages/simuler']

export function estRequeteAutoriseeEnDemo(methode: string, motifRoute: string | undefined): boolean {
  const m = methode.toUpperCase()
  if (METHODES_LECTURE.has(m)) return true
  return motifRoute !== undefined && ECRITURES_AUTORISEES_EN_DEMO.includes(`${m} ${motifRoute}`)
}
