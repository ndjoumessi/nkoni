/**
 * Modèle de contenu des TEXTES LÉGAUX (CGU, politique de confidentialité) — de la DONNÉE typée,
 * chargée à la demande, jamais un catalogue i18n (même raison que la documentation `/aide` :
 * `locales/{fr,en}/index.ts` est chargé au démarrage pour tout le monde, un corpus juridique
 * entier y alourdirait le paquet initial d'un membre qui ne l'ouvrira jamais).
 *
 * Différence avec `content/aide/types.ts`, et c'est la raison d'un modèle distinct : un texte
 * juridique porte des liens et des mises en évidence **à l'intérieur** d'une phrase (« notre
 * politique de confidentialité », « 30 jours », « exécution du contrat »). Un paragraphe est donc
 * une suite de SEGMENTS, pas une chaîne.
 */

/** Fragment d'un paragraphe : texte nu, mise en évidence, ou lien (route interne ou `mailto:`). */
export type Segment = string | { accent: string } | { texte: string; vers: string }

export type BlocLegal =
  | { type: 'paragraphe'; contenu: Segment[] }
  /** Intertitre à l'intérieur d'une section (ex. « Données de compte »). */
  | { type: 'sousTitre'; texte: string }
  | { type: 'liste'; items: Segment[][] }

export interface SectionLegale {
  /** Ancre stable, en kebab-case ; NE CHANGE JAMAIS une fois publiée (liens partagés, citations). */
  id: string
  titre: string
  blocs: BlocLegal[]
}

export interface DocumentLegal {
  titre: string
  /**
   * Date de dernière mise à jour en ISO (`AAAA-MM-JJ`), PAS une date rédigée : elle est formatée
   * dans la langue de lecture. Une date écrite à la main dans chaque langue finirait par diverger,
   * et sur un document opposable la date engage.
   */
  majLe: string
  sections: SectionLegale[]
}
