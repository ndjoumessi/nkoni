import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { NkoniMark } from '@/components/ui/NkoniMark'

/**
 * Coquille des pages PUBLIQUES de texte long (légales, aide) — accessibles SANS authentification.
 *
 * Les libellés sont des PROPS et non des `t()` : les pages légales sont volontairement françaises
 * (corps juridique non traduit), les pages d'aide sont bilingues. Un `t()` ici donnerait un corps
 * français sous un chrome anglais. La mise en page, elle, est partagée — ne pas la redupliquer.
 */
export function PagePublique({
  titre,
  sousTitre,
  retourLibelle,
  retourVers = '/',
  actions,
  children,
}: {
  titre: string
  sousTitre?: string
  retourLibelle: string
  /** Destination du lien de retour (défaut : l'accueil public). */
  retourVers?: string
  /** Contrôles additionnels dans l'en-tête, avant le lien de retour (ex. sélecteur de langue). */
  actions?: ReactNode
  children: ReactNode
}) {
  // React Router CONSERVE la position de défilement entre routes : arrivé depuis un pied de page
  // défilé tout en bas, on atterrissait au milieu du texte, titre hors écran. Une page de lecture
  // s'ouvre sur son titre.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <NkoniMark className="h-7 w-7" />
            {/* Le nom s'efface sous `sm`, TOUJOURS et non selon la présence d'actions : ces
                en-têtes gagnent ou perdent leur sélecteur quand la session se tranche, et une
                classe conditionnelle ferait alors sauter la mise en page sous nos yeux. À 360 px,
                logo + sélecteur + lien de retour ne tiennent de toute façon pas avec le nom. */}
            <span className="hidden font-display text-lg font-semibold tracking-tight text-foreground sm:inline">
              NKONI
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {actions}
            <Link
              to={retourVers}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {retourLibelle}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{titre}</h1>
        {sousTitre && <p className="mt-2 text-sm text-faint">{sousTitre}</p>}
        {children}
      </div>
    </main>
  )
}

export default PagePublique
