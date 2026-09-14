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

/** Date CALENDAIRE (AAAA-MM-JJ) d'un instant, lue dans le fuseau applicatif. */
export function dateCalendaireApp(instant: Date): string {
  // `en-CA` formate en AAAA-MM-JJ : chaîne directement découpable et comparable.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_APP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

const MS_PAR_JOUR = 86_400_000

/** Découpe « AAAA-MM-JJ » en nombres (défauts NaN : `noUncheckedIndexedAccess`). */
function partiesDate(dateCalendaire: string): [number, number, number] {
  const [annee = NaN, mois = NaN, jour = NaN] = dateCalendaire.split('-').map(Number)
  return [annee, mois, jour]
}

/**
 * Nombre de jours CALENDAIRES (fuseau applicatif) de `de` à `a` : 0 le même jour, 1 le lendemain,
 * négatif si `a` précède `de`. Ne dépend jamais de l'heure : 23 h 58 et 00 h 02 le lendemain à Douala
 * sont à 1 jour, bien qu'à 4 minutes d'écart.
 */
export function joursCalendairesEntreApp(de: Date, a: Date): number {
  const [aDe, mDe, jDe] = partiesDate(dateCalendaireApp(de))
  const [aA, mA, jA] = partiesDate(dateCalendaireApp(a))
  return Math.round((Date.UTC(aA, mA - 1, jA) - Date.UTC(aDe, mDe - 1, jDe)) / MS_PAR_JOUR)
}

/** Écart (ms) entre l'heure murale du fuseau applicatif et UTC, à l'instant donné. */
function decalageAppMs(instant: Date): number {
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUSEAU_APP,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  const murale = Date.UTC(
    Number(parties['year']),
    Number(parties['month']) - 1,
    Number(parties['day']),
    Number(parties['hour']),
    Number(parties['minute']),
    Number(parties['second']),
  )
  return murale - Math.floor(instant.getTime() / 1000) * 1000
}

/** Première milliseconde (00:00:00.000, heure applicative) du jour calendaire contenant `instant`. */
export function debutDeJourneeApp(instant: Date): Date {
  const [annee, mois, jour] = partiesDate(dateCalendaireApp(instant))
  const debutMural = Date.UTC(annee, mois - 1, jour, 0, 0, 0, 0)
  return new Date(debutMural - decalageAppMs(new Date(debutMural)))
}

/** Dernière milliseconde (23:59:59.999, heure applicative) du jour calendaire contenant `instant`. */
export function finDeJourneeApp(instant: Date): Date {
  const [annee, mois, jour] = partiesDate(dateCalendaireApp(instant))
  const finMurale = Date.UTC(annee, mois - 1, jour, 23, 59, 59, 999)
  return new Date(finMurale - decalageAppMs(new Date(finMurale)))
}

/**
 * Ajoute `mois` mois calendaires au jour applicatif de `instant`, en BORNANT au dernier jour du mois
 * d'arrivée (31 janvier + 1 mois = 28 ou 29 février, jamais 3 mars). Renvoie midi (heure applicative)
 * de ce jour : un instant sans ambiguïté de date, à passer ensuite à `finDeJourneeApp`.
 */
export function ajouterMoisApp(instant: Date, mois: number): Date {
  const [annee, moisDepart, jour] = partiesDate(dateCalendaireApp(instant))
  const index = moisDepart - 1 + mois
  const anneeCible = annee + Math.floor(index / 12)
  const moisCible = ((index % 12) + 12) % 12
  const dernierJour = new Date(Date.UTC(anneeCible, moisCible + 1, 0)).getUTCDate()
  const midiMural = Date.UTC(anneeCible, moisCible, Math.min(jour, dernierJour), 12)
  return new Date(midiMural - decalageAppMs(new Date(midiMural)))
}
