import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Info, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { organisationApi, type OrganisationCourante } from '@/lib/api'
import { bandeauForfait, estBandeauFerme, fermerBandeau, type BandeauForfaitVue } from '@/lib/bandeau-forfait'
import { cleI18n } from '@/lib/i18n'
import { peutGererForfait } from '@/lib/roles'
import { cn, formatDateApp } from '@/lib/utils'

/** Teinte par ton — jetons du design system (même palette que la bannière d'incident de /statut). */
const STYLE: Record<BandeauForfaitVue['ton'], { cadre: string; texte: string; icone: LucideIcon }> = {
  info: { cadre: 'border-brass/30 bg-brass/[0.07]', texte: 'text-brass', icone: Info },
  or: { cadre: 'border-amber/30 bg-amber/[0.07]', texte: 'text-amber', icone: AlertTriangle },
  neutre: { cadre: 'border-hairline bg-surface', texte: 'text-muted-foreground', icone: CalendarClock },
}

/**
 * Bandeau d'échéance du forfait, en tête du contenu (spec 1.1 §4.4). Réservé au bureau dirigeant
 * (`peutGererForfait`) : un membre ne voit jamais de message commercial (§1.1). Lit
 * `GET /organisations/moi` une fois par session d'affichage de la coquille ; en cas d'échec, n'affiche
 * rien (le bandeau est un rappel, pas une fonctionnalité). `role="status"` : message d'information,
 * jamais une alerte qui interromprait un lecteur d'écran.
 */
export function BandeauForfait() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const { pathname } = useLocation()
  const autorise = peutGererForfait(user?.role)
  const [org, setOrg] = useState<OrganisationCourante | null>(null)
  const [fermes, setFermes] = useState<string[]>([])

  useEffect(() => {
    if (!autorise || !accessToken) return
    const controleur = new AbortController()
    organisationApi
      .moi(accessToken, controleur.signal)
      .then(setOrg)
      .catch(() => undefined)
    return () => controleur.abort()
  }, [autorise, accessToken])

  if (!autorise || !org) return null
  // La carte d'échéance de /parametres dit déjà la même chose (lien redondant vers soi-même).
  if (pathname === '/parametres') return null
  const vue = bandeauForfait(org)
  if (!vue) return null
  if (vue.fermable && (fermes.includes(vue.idFermeture) || estBandeauFerme(vue.idFermeture))) return null

  const style = STYLE[vue.ton]
  const Icone = style.icone
  const params = {
    forfait: t(cleI18n(`commun.forfaits.${org.forfait}`)),
    date: formatDateApp(org.forfaitExpireLe),
    fin: formatDateApp(org.finGraceLe),
  }

  return (
    <div role="status" className={cn('mb-6 flex items-start gap-3 rounded-2xl border p-4', style.cadre)}>
      <Icone className={cn('mt-0.5 h-5 w-5 shrink-0', style.texte)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{t(cleI18n(`shell.bandeauForfait.${vue.cle}`), params)}</p>
        <Link to="/parametres" className={cn('mt-1 inline-block text-sm font-medium underline-offset-4 hover:underline', style.texte)}>
          {t('shell.bandeauForfait.voir')}
        </Link>
      </div>
      {vue.fermable && (
        <button
          type="button"
          onClick={() => {
            fermerBandeau(vue.idFermeture)
            setFermes((f) => [...f, vue.idFermeture])
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t('shell.bandeauForfait.fermer')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
