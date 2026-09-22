import type { DocumentLegal } from './types'

/**
 * Chargement À LA DEMANDE des textes légaux traduits (même raison que `content/aide/registre.ts` :
 * hors des catalogues i18n, qui sont chargés au démarrage pour tout le monde).
 *
 * **Le français est la version qui fait foi** (décision PO du 2026-09-22) : l'anglais est une
 * traduction de courtoisie, signalée comme telle en tête de page par `RenduLegal`. Les MENTIONS
 * LÉGALES ne sont volontairement pas traduites — c'est une formalité du droit français (LCEN),
 * sans portée pour un lecteur anglophone ; leur page affiche un avis dédié.
 */
export const TEXTES_LEGAUX = ['cgu', 'confidentialite'] as const
export type TexteLegal = (typeof TEXTES_LEGAUX)[number]

type Chargeur = () => Promise<{ default: DocumentLegal }>

const CHARGEURS: Record<'fr' | 'en', Record<TexteLegal, Chargeur>> = {
  fr: {
    cgu: () => import('./fr/cgu'),
    confidentialite: () => import('./fr/confidentialite'),
  },
  en: {
    cgu: () => import('./en/cgu'),
    confidentialite: () => import('./en/confidentialite'),
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
