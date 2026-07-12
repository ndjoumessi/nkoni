import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Cake } from 'lucide-react'
import type { AnniversaireMembre } from '@/lib/api'
import { Card, Overline } from '@/components/ui/Card'

/**
 * Anniversaires du mois — humanise le dashboard (§ dashboard). Rendu uniquement s'il y a au
 * moins un anniversaire ce mois-ci ; chaque ligne renvoie vers la fiche du membre.
 */
export function AnniversairesCard({ anniversaires }: { anniversaires: AnniversaireMembre[] }) {
  const { t } = useTranslation()
  if (anniversaires.length === 0) return null
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Cake className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('dashboard.anniversaires.titre')}</Overline>
      </div>
      <ul className="mt-3 space-y-0.5">
        {anniversaires.map((a) => (
          <li key={a.id}>
            <Link
              to={`/membres/${a.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2/70"
            >
              <span className="text-foreground">
                {a.prenom} {a.nom}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('dashboard.anniversaires.leJour', { jour: a.jour })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default AnniversairesCard
