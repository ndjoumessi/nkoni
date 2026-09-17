import type { Document } from './types'

/**
 * Chargement À LA DEMANDE des documents d'aide. Le contenu ne passe JAMAIS par les catalogues i18n
 * (`locales/{fr,en}/index.ts` est chargé au démarrage) : il alourdirait le paquet initial pour tout
 * le monde, y compris un membre sur mobile qui ne le lira pas.
 */
export const GUIDES = ['membre', 'bureau', 'faq'] as const
export type Guide = (typeof GUIDES)[number]

type Chargeur = () => Promise<{ default: Document }>

const CHARGEURS: Record<'fr' | 'en', Record<Guide, Chargeur>> = {
  fr: {
    membre: () => import('./fr/membre'),
    bureau: () => import('./fr/bureau'),
    faq: () => import('./fr/faq'),
  },
  en: {
    membre: () => import('./en/membre'),
    bureau: () => import('./en/bureau'),
    faq: () => import('./en/faq'),
  },
}

export function estGuide(valeur: string): valeur is Guide {
  return (GUIDES as readonly string[]).includes(valeur)
}

/**
 * `codeLangue` est le code i18n courant (`fr` / `en`). Une langue inconnue retombe sur le français :
 * un texte dans la mauvaise langue vaut mieux qu'une page vide.
 */
export async function chargerDocument(guide: Guide, codeLangue: string): Promise<Document> {
  const langue = codeLangue.toLowerCase().startsWith('en') ? 'en' : 'fr'
  return (await CHARGEURS[langue][guide]()).default
}
