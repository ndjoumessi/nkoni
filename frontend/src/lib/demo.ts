/**
 * Espace de démonstration (spec 2026-09-15 §2.4) — MIROIR de `backend/src/lib/demo.ts`.
 *
 * Le serveur reste l'autorité (garde dans `authenticate`) ; ce miroir permet au client HTTP de
 * refuser LOCALEMENT une écriture en mode démo, sans aller-retour. Parité figée par
 * `demo-parity.test.ts`. Le front compare un CHEMIN réel (requête retirée), le serveur un motif de
 * route : les exceptions actuelles n'ont aucun paramètre, un motif paramétré exigerait d'adapter ici.
 */

const METHODES_LECTURE = new Set(['GET', 'HEAD'])

export const ECRITURES_AUTORISEES_EN_DEMO: readonly string[] = ['POST /equilibrages/simuler']

export function estRequeteAutoriseeEnDemo(methode: string, chemin: string): boolean {
  const m = methode.toUpperCase()
  if (METHODES_LECTURE.has(m)) return true
  const sansRequete = chemin.split('?')[0]
  return ECRITURES_AUTORISEES_EN_DEMO.includes(`${m} ${sansRequete}`)
}
