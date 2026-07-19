/**
 * « Maintenant » dans le fuseau APPLICATIF — source unique pour l'année et le mois courants.
 *
 * Le process tourne en UTC (Railway) alors que l'organisation vit en `Africa/Douala` (UTC+1).
 * Dériver la date courante avec `new Date().getFullYear()` / `.getMonth()` lit donc le fuseau du
 * PROCESS et décale d'une heure autour des changements de période :
 *   - le 1er janvier entre 00h00 et 01h00 à Douala, le backend est encore au 31 décembre →
 *     l'année courante vaut l'année précédente (ouvrir la nouvelle année serait refusé) ;
 *   - le 1er du mois à minuit local, le mois courant vaut le mois précédent (bug vécu sur les
 *     « anniversaires du mois »).
 *
 * Les cœurs métier gardent leur horloge INJECTÉE (testables sans horloge réelle) : ces helpers ne
 * servent qu'à calculer la valeur par DÉFAUT, au bord de l'application.
 */

/** Fuseau de référence de l'organisation (aligné sur le cron du scheduler). */
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
