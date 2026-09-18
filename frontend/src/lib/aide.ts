import type { Guide } from '@/content/aide/registre'

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

/**
 * Lien « En savoir plus » optionnel : la SECTION de la documentation publique qui approfondit la
 * notion (`/aide/<guide>#<ancre>`). Le lien s'ouvre dans un NOUVEL ONGLET (`AideNotion`) : un « ? »
 * posé à côté d'un champ de formulaire ne doit pas faire perdre la saisie en cours.
 *
 * Chaque ancre est vérifiée contre les sections RÉELLES du guide (`aide-catalogue.test.ts`) — un
 * identifiant de section ne change jamais une fois publié, mais une faute de frappe ici aboutirait
 * en haut d'une page sans rapport. Notions volontairement SANS lien :
 * - `modeRotation` : placée dans un `Modal`, dont le piège à focus referme la bulle avant qu'on
 *   atteigne le lien (cf. `AideNotion`) ;
 * - `equilibrage` : aucune section de la documentation ne l'approfondit au-delà du texte de la bulle.
 */
export const LIENS_AIDE: Partial<Record<NotionAide, `/aide/${Guide}#${string}`>> = {
  bareme: '/aide/bureau#mettre-en-route',
  ouvrirAnnee: '/aide/faq#reouvrir-une-annee',
  attendu: '/aide/bureau#suivre-le-recouvrement',
  verse: '/aide/bureau#suivre-le-recouvrement',
  valorise: '/aide/faq#membre-non-a-jour-alors-quil-a-paye',
  statutCotisation: '/aide/membre#mon-statut',
  anneeAdhesion: '/aide/bureau#ajouter-des-membres',
  finContribution: '/aide/bureau#ajouter-des-membres',
  chefSousFamille: '/aide/bureau#ajouter-des-membres',
  chefOrganisation: '/aide/bureau#mettre-en-route',
  recus: '/aide/bureau#corriger-une-erreur',
  circuitDepense: '/aide/bureau#tresorerie-et-depenses',
  cagnotte: '/aide/bureau#autres-caisses',
  voteResolution: '/aide/bureau#vie-associative',
  forfaitEcheance: '/aide/bureau#forfait',
}
