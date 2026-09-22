import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { PagePublique } from '@/components/public/PagePublique'
import { useChromePublic } from '@/components/public/chrome-public'
import { GUIDES } from '@/content/aide/registre'
import { cleI18n } from '@/lib/i18n'

/**
 * Sommaire PUBLIC de la documentation (`/aide`, spec 2026-09-18) — trois entrées dérivées de
 * `GUIDES` (source unique, cf. `content/aide/registre.ts`) : ajouter un guide au registre suffit
 * à l'y faire apparaître, sans dupliquer la liste ici.
 */
export function AidePage() {
  const { t } = useTranslation()
  const chrome = useChromePublic()

  return (
    <PagePublique
      titre={t('aideDoc.titre')}
      sousTitre={t('aideDoc.intro')}
      {...chrome}
    >
      <nav aria-label={t('aideDoc.sommaire')} className="mt-8 space-y-3">
        {GUIDES.map((guide) => (
          <Link
            key={guide}
            to={`/aide/${guide}`}
            className="group flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface p-4 transition-colors hover:border-brass/40"
          >
            <div className="min-w-0">
              <p className="font-display text-base font-semibold tracking-tight text-foreground">
                {t(cleI18n(`aideDoc.guides.${guide}.titre`))}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(cleI18n(`aideDoc.guides.${guide}.description`))}
              </p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ))}
      </nav>
    </PagePublique>
  )
}

export default AidePage
