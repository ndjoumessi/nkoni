/**
 * Aide contextuelle (spec 2026-09-17) — catalogue des notions expliquées par le « ? » (`AideNotion`).
 *
 * Une notion = un texte, écrit une fois dans `locales/{fr,en}/aide.ts` et réutilisé partout où elle
 * apparaît. Le type `NotionAide` fait échouer la compilation d'une notion inconnue ; la complétude des
 * textes est vérifiée par `aide-catalogue.test.ts`, l'usage de chaque notion par `aide-usage.test.ts`.
 * Toute règle métier citée dans un texte doit rester conforme au code : changer la règle = changer le
 * texte dans la même PR.
 */
export const NOTIONS_AIDE = [
  'bareme',
  'ouvrirAnnee',
  'attendu',
  'verse',
  'valorise',
  'statutCotisation',
  'equilibrage',
  'anneeAdhesion',
  'finContribution',
  'chefSousFamille',
  'chefOrganisation',
  'recus',
  'circuitDepense',
  'modeRotation',
  'cagnotte',
  'voteResolution',
  'forfaitEcheance',
] as const

export type NotionAide = (typeof NOTIONS_AIDE)[number]

/** Lien « En savoir plus » optionnel (route interne uniquement). */
export const LIENS_AIDE: Partial<Record<NotionAide, string>> = {
  attendu: '/bareme',
}
