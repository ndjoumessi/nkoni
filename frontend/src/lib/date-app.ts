/**
 * « Maintenant » dans le fuseau APPLICATIF — miroir de `backend/src/lib/date-app.ts`.
 *
 * Le navigateur peut être n'importe où (diaspora), alors que l'organisation vit en
 * `Africa/Douala`. Dériver la date courante avec `new Date().getFullYear()` / `.getMonth()` lit le
 * fuseau du POSTE et désynchronise l'UI du serveur :
 *   - un trésorier à l'est de Douala verrait la nouvelle année (et ses actions) avant que le
 *     backend ne l'accepte — bouton actif, requête refusée ;
 *   - à l'ouest, le mois courant peut retarder d'un jour (bug vécu sur les « anniversaires du mois »).
 *
 * Toute logique dépendant de « quelle année/quel mois sommes-nous » DOIT passer par ces helpers.
 * Les dates SAISIES (naissance, versement) restent lues telles quelles — elles ne glissent pas.
 */

/** Fuseau de référence de l'organisation (aligné sur le backend et le cron du scheduler). */
export const FUSEAU_APP = 'Africa/Douala'

/** Année courante (1970→) dans le fuseau applicatif. */
export function anneeCouranteApp(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU_APP, year: 'numeric' }).format(now),
  )
}

/** Mois courant (1→12) dans le fuseau applicatif. */
export function moisCourantApp(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU_APP, month: 'numeric' }).format(now),
  )
}
