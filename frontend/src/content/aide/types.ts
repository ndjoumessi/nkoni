/**
 * Modèle de contenu de la documentation (spec 2026-09-18). Le contenu est de la DONNÉE, pas du JSX :
 * le rendu, les ancres et le sommaire en découlent, et les chaînes restent courtes donc relisibles
 * en diff. Ce fichier ne contient QUE des types — il peut donc être importé partout sans coût.
 */

export type Bloc =
  | { type: 'paragraphe'; texte: string }
  /** Liste ORDONNÉE : « faites ceci, puis cela ». */
  | { type: 'etapes'; etapes: string[] }
  /** Liste non ordonnée : énumération sans ordre imposé. */
  | { type: 'liste'; items: string[] }
  | { type: 'note'; ton: 'info' | 'attention'; texte: string }
  /** Lien INTERNE à l'application (jamais une URL externe) — validité gardée par un test. */
  | { type: 'lien'; vers: string; libelle: string }

export interface SectionDoc {
  /** Ancre STABLE, kebab-case sans accent. Ne change JAMAIS une fois publiée : des liens la citent. */
  id: string
  titre: string
  blocs: Bloc[]
}

export interface Document {
  titre: string
  intro: string
  sections: SectionDoc[]
}
