import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { NkoniMark } from '@/components/ui/NkoniMark'

/**
 * Coquille PUBLIQUE des pages légales (Confidentialité, CGU) — accessibles SANS authentification
 * (une politique de confidentialité DOIT être publique). Contenu volontairement en FRANÇAIS
 * (marché cible francophone) ; une version EN est un chantier de traduction séparé. Le corps
 * juridique porte des PLACEHOLDERS `[ … ]` à compléter et faire relire avant publication réelle.
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
    <main className="min-h-screen bg-background">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <NkoniMark className="h-7 w-7" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              NKONI
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Accueil
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{titre}</h1>
        <p className="mt-2 text-sm text-faint">Dernière mise à jour : {majLe}</p>
        <div className="mt-8 space-y-9">{children}</div>
      </div>
    </main>
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
