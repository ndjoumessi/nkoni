import { Link } from 'react-router-dom'
import { Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Bloc, Document } from '@/content/aide/types'

/**
 * Rendu d'un document d'aide : sommaire d'ancres puis sections. Primitive PARTAGÉE par les trois
 * guides — ne pas recréer de rendu ad hoc. Les titres de section sont des `h2` : le `h1` appartient
 * à la page, qui porte le titre du document.
 */
function RenduBloc({ bloc }: { bloc: Bloc }) {
  switch (bloc.type) {
    case 'paragraphe':
      return <p className="text-sm leading-relaxed text-muted-foreground">{bloc.texte}</p>
    case 'etapes':
      return (
        <ol
          data-bloc="etapes"
          className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground"
        >
          {bloc.etapes.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ol>
      )
    case 'liste':
      return (
        <ul
          data-bloc="liste"
          className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground"
        >
          {bloc.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )
    case 'note': {
      const attention = bloc.ton === 'attention'
      const Icone = attention ? TriangleAlert : Info
      return (
        <div
          role="note"
          className={cn(
            'flex gap-2.5 rounded-xl border p-3.5 text-sm leading-relaxed',
            attention
              ? 'border-terra/40 bg-terra/10 text-terra-text'
              : 'border-hairline bg-surface text-muted-foreground',
          )}
        >
          <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{bloc.texte}</span>
        </div>
      )
    }
    case 'lien':
      return (
        <Link
          to={bloc.vers}
          className="inline-block text-sm font-medium text-brass underline-offset-4 hover:underline"
        >
          {bloc.libelle}
        </Link>
      )
    default: {
      // Garde d'EXHAUSTIVITÉ : `tsconfig.app.json` n'active ni `strict` ni `noImplicitReturns`, donc
      // sans cette branche un type de `Bloc` ajouté plus tard et oublié ici ne romprait PAS la
      // compilation — `RenduBloc` n'a pas de type de retour annoté, une branche non gérée renvoie
      // silencieusement `undefined`, accepté comme `ReactNode`. Le contenu manquerait alors dans la
      // documentation publiée SANS aucune erreur ni crash. En assignant `bloc` à `never`, ce bloc ne
      // type-check QUE si toutes les variantes de `Bloc` sont couvertes par les `case` ci-dessus :
      // en ajouter une nouvelle sans l'implémenter fait échouer `tsc` ici, au lieu d'un oubli muet.
      const _exhaustif: never = bloc
      return _exhaustif
    }
  }
}

export function RenduDoc({
  document,
  libelleSommaire,
}: {
  document: Document
  libelleSommaire: string
}) {
  return (
    <>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{document.intro}</p>

      <nav aria-label={libelleSommaire} className="mt-8 rounded-xl border border-hairline bg-surface p-4">
        <ol className="space-y-1.5 text-sm">
          {document.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-brass underline-offset-4 hover:underline">
                {s.titre}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {document.sections.map((s) => (
          // `scroll-mt` : sans marge de défilement, l'ancre colle le titre au bord haut de l'écran.
          <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {s.titre}
            </h2>
            {s.blocs.map((bloc, i) => (
              <RenduBloc key={i} bloc={bloc} />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

export default RenduDoc
