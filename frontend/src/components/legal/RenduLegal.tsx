import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import type { BlocLegal, DocumentLegal, Segment } from '@/content/legal/types'

/**
 * Rendu d'un texte légal (`content/legal/`) — pendant de `RenduDoc` pour la documentation, avec
 * deux différences qui viennent du contenu, pas du style :
 *
 * 1. **Les segments** : un paragraphe juridique porte des liens et des mises en évidence DANS la
 *    phrase, alors qu'un bloc d'aide est une chaîne entière.
 * 2. **L'avertissement de traduction** : quand le texte affiché n'est pas le français, un encart
 *    dit que la version française est la seule qui fasse foi. Il est posé ICI, une fois, et non
 *    dans chaque document : un texte traduit plus tard l'obtient sans qu'on y pense, et personne
 *    ne peut publier une traduction sans cet avertissement en l'oubliant dans son fichier.
 *
 * Trois sortes de liens, trois rendus : une route interne en `<Link>` (pas de rechargement
 * complet) ; un `mailto:`/`tel:` en `<a>` nu ; un lien EXTERNE (hébergeurs des mentions légales) en
 * `<a target="_blank" rel="noopener noreferrer">` — on ne fait pas quitter un document juridique en
 * cours de lecture, et `noopener` est la règle pour tout lien sortant.
 */
const CLASSE_LIEN = 'text-brass underline-offset-2 hover:underline'

function RenduSegment({ segment }: { segment: Segment }) {
  if (typeof segment === 'string') return <>{segment}</>
  if ('accent' in segment) return <span className="text-foreground">{segment.accent}</span>
  if (segment.vers.startsWith('/')) {
    return (
      <Link to={segment.vers} className={CLASSE_LIEN}>
        {segment.texte}
      </Link>
    )
  }
  const externe = segment.vers.startsWith('http')
  return (
    <a
      href={segment.vers}
      className={CLASSE_LIEN}
      {...(externe ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {segment.texte}
    </a>
  )
}

function Segments({ contenu }: { contenu: Segment[] }) {
  return (
    <>
      {contenu.map((segment, i) => (
        <RenduSegment key={i} segment={segment} />
      ))}
    </>
  )
}

function RenduBloc({ bloc }: { bloc: BlocLegal }) {
  switch (bloc.type) {
    case 'paragraphe':
      return (
        <p>
          <Segments contenu={bloc.contenu} />
        </p>
      )
    case 'sousTitre':
      return <p className="font-medium text-foreground">{bloc.texte}</p>
    case 'liste':
      return (
        <ul className="list-disc space-y-1 pl-5">
          {bloc.items.map((item, i) => (
            <li key={i}>
              <Segments contenu={item} />
            </li>
          ))}
        </ul>
      )
    default: {
      // `tsconfig.app.json` n'active ni `strict` ni `noImplicitReturns` : sans cette garde, un type
      // de bloc ajouté et oublié ici disparaîtrait du rendu en silence au lieu de casser `tsc`.
      const _exhaustif: never = bloc
      return _exhaustif
    }
  }
}

/**
 * `traduction` : le document rendu n'est pas la version de référence (française). L'appelant le sait
 * — il a choisi la langue de chargement — et le passe explicitement, plutôt que de le redéduire ici.
 */
export function RenduLegal({ document, traduction }: { document: DocumentLegal; traduction: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="mt-8 space-y-9">
      {traduction && (
        <p
          role="note"
          className="flex gap-2.5 rounded-xl border border-hairline bg-surface-2/50 p-4 text-sm text-muted-foreground"
        >
          <Languages className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
          <span>{t('legal.avisTraduction')}</span>
        </p>
      )}
      {document.sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {section.titre}
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {section.blocs.map((bloc, i) => (
              <RenduBloc key={i} bloc={bloc} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default RenduLegal
