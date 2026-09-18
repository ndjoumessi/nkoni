import type { ReactNode } from 'react'
import { PagePublique } from '@/components/public/PagePublique'

/**
 * Coquille PUBLIQUE des pages légales (Confidentialité, CGU) — accessibles SANS authentification
 * (une politique de confidentialité DOIT être publique). Contenu volontairement en FRANÇAIS
 * (marché cible francophone) ; une version EN est un chantier de traduction séparé. Le corps
 * juridique porte des PLACEHOLDERS `[ … ]` à compléter et faire relire avant publication réelle.
 *
 * La mise en page (en-tête logo + lien retour, remontée en haut au montage) est FACTORISÉE dans
 * `PagePublique`, partagée avec les pages d'aide (bilingues) — ce composant ne fournit plus que
 * ses chaînes françaises en dur.
 */
export function PageLegale({
  titre,
  majLe,
  children,
}: {
  titre: string
  majLe: string
  children: ReactNode
}) {
  return (
    <PagePublique titre={titre} sousTitre={`Dernière mise à jour : ${majLe}`} retourLibelle="Accueil">
      <div className="mt-8 space-y-9">{children}</div>
    </PagePublique>
  )
}

/** Section légale = titre + corps. */
export function SectionLegale({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{titre}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/** Marque un texte À COMPLÉTER (placeholder) — visuellement distinct pour ne pas publier par erreur. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber/20 px-1 py-0.5 font-medium text-amber">[{children}]</mark>
  )
}

export default PageLegale
