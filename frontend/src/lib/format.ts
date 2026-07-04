/** Formatage FR pour les montants FCFA et les pourcentages du tableau de bord. */

const nombreFr = new Intl.NumberFormat('fr-FR')

/** Montant entier en FCFA, ex. `30000` → « 30 000 FCFA ». */
export function formatFcfa(montant: number): string {
  return `${nombreFr.format(montant)} FCFA`
}

/** Nombre entier groupé à la française, ex. `1234` → « 1 234 ». */
export function formatNombre(n: number): string {
  return nombreFr.format(n)
}

/** Pourcentage, ex. `50` → « 50 % », `33.33` → « 33,33 % ». */
export function formatPourcent(valeur: number): string {
  return `${nombreFr.format(valeur)} %`
}
