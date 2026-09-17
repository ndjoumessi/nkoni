import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import { LIENS_AIDE, type NotionAide } from '@/lib/aide'
import { cleI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usePopoverFlottant } from './usePopoverFlottant'

/**
 * Aide contextuelle (spec 2026-09-17) : un « ? » à côté d'une notion métier, qui ouvre une courte
 * explication tirée du catalogue (`lib/aide.ts` + namespace i18n `aide`). Primitive PARTAGÉE — ne pas
 * recréer d'infobulle ad hoc.
 *
 * - Ouverture au clic et au clavier, JAMAIS au survol (absent sur mobile, gênant au lecteur d'écran).
 * - Bulle en PORTAIL via `usePopoverFlottant` (immunité aux contextes d'empilement `nk-reveal`).
 * - Échap referme et rend le focus au « ? » ; clic extérieur et second clic referment.
 * - Placement : à côté d'un libellé, jamais DANS un `<label>` ou un titre (`Field`/`PageHeader` ont une
 *   prop `aide`), jamais dans une ligne de tableau ; au plus un « ? » par notion dans un écran.
 */
export function AideNotion({ notion, className }: { notion: NotionAide; className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const idTexte = useId()
  const fermer = useCallback(() => setOpen(false), [])
  const { containerRef, triggerRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: fermer,
    largeurDefaut: 288,
    hauteurDefaut: 160,
  })

  const titre = t(cleI18n(`aide.notions.${notion}.titre`))
  const lien = LIENS_AIDE[notion]

  const fermerEtRefocaliser = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <span ref={containerRef} className={cn('relative inline-flex align-middle', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            fermerEtRefocaliser()
          }
        }}
        aria-label={t('aide.libelleBouton', { titre })}
        aria-expanded={open}
        aria-controls={open ? idTexte : undefined}
        className="tap-target inline-flex h-5 w-5 items-center justify-center rounded-full text-faint transition-colors hover:text-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open &&
        rendreFlottant(
          <div
            id={idTexte}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                fermerEtRefocaliser()
              }
            }}
            className="w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-hairline-strong bg-surface p-4 text-left normal-case tracking-normal shadow-2xl"
          >
            <p className="text-sm font-semibold text-foreground">{titre}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(cleI18n(`aide.notions.${notion}.texte`))}
            </p>
            {lien && (
              <Link
                to={lien}
                onClick={() => setOpen(false)}
                className="mt-2 inline-block text-sm font-medium text-brass underline-offset-4 hover:underline"
              >
                {t('aide.enSavoirPlus')}
              </Link>
            )}
          </div>,
          { className: 'z-50', 'aria-label': titre },
        )}
    </span>
  )
}
