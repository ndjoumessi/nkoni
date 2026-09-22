import type { DocumentLegal } from './types'

/**
 * Chargement À LA DEMANDE des textes légaux traduits (même raison que `content/aide/registre.ts` :
 * hors des catalogues i18n, qui sont chargés au démarrage pour tout le monde).
 *
 * **Le français est la version qui fait foi** (décision PO du 2026-09-22) : l'anglais est une
 * traduction de courtoisie, signalée comme telle en tête de page par `RenduLegal`. Les mentions
 * légales sont traduites AUSSI (2026-09-22, sur capture d'écran du PO) : les laisser en français
 * sous un chrome anglais donnait une page mi-traduite, que même un lecteur d'écran ne pouvait pas
 * prononcer — le document déclarait `lang="en"` sur du texte français (WCAG 3.1.2).
 */
export const TEXTES_LEGAUX = ['cgu', 'confidentialite', 'mentions-legales'] as const
export type TexteLegal = (typeof TEXTES_LEGAUX)[number]

type Chargeur = () => Promise<{ default: DocumentLegal }>

const CHARGEURS: Record<'fr' | 'en', Record<TexteLegal, Chargeur>> = {
  fr: {
    cgu: () => import('./fr/cgu'),
    confidentialite: () => import('./fr/confidentialite'),
    'mentions-legales': () => import('./fr/mentions-legales'),
  },
  en: {
    cgu: () => import('./en/cgu'),
    confidentialite: () => import('./en/confidentialite'),
    'mentions-legales': () => import('./en/mentions-legales'),
  },
}

/** Langue de RENDU d'un texte légal : l'anglais si demandé, le français sinon (version de référence). */
export function langueTexteLegal(codeLangue: string): 'fr' | 'en' {
  return codeLangue.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

export async function chargerTexteLegal(
  texte: TexteLegal,
  codeLangue: string,
): Promise<DocumentLegal> {
  return (await CHARGEURS[langueTexteLegal(codeLangue)][texte]()).default
}
