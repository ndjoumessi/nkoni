import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  LifeBuoy,
  Info,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { API_URL, statutApi, type IncidentPublic, type GraviteIncident } from '@/lib/api'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { cleI18n } from '@/lib/i18n'
import { cn, formatDateHeure } from '@/lib/utils'

/** Tonalité de la bannière d'incident selon la gravité (même palette que les états). */
const GRAVITE_STYLE: Record<GraviteIncident, { ring: string; tone: string; icon: LucideIcon }> = {
  INFO: { ring: 'border-brass/30 bg-brass/[0.07]', tone: 'text-brass', icon: Info },
  MAINTENANCE: { ring: 'border-amber/30 bg-amber/[0.07]', tone: 'text-amber', icon: Wrench },
  INCIDENT: { ring: 'border-terra/30 bg-terra/[0.07]', tone: 'text-terra', icon: AlertTriangle },
}

const CONTACT_SUPPORT = 'romel.djoumessi@gmail.com'

type Etat = 'verification' | 'operationnel' | 'incident'

/** Bannière d'incident publiée (SUPER_ADMIN) — au-dessus de l'état sondé, tonée par gravité. */
function BanniereIncident({ incident }: { incident: Extract<IncidentPublic, { actif: true }> }) {
  const { t } = useTranslation()
  const style = GRAVITE_STYLE[incident.gravite]
  const GIcon = style.icon
  return (
    <div className={cn('mt-8 flex items-start gap-3 rounded-2xl border p-5', style.ring)} role="alert">
      <GIcon className={cn('mt-0.5 h-5 w-5 shrink-0', style.tone)} aria-hidden="true" />
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', style.tone)}>
          {t(cleI18n(`statut.incident.gravites.${incident.gravite}`))}
        </p>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {incident.message}
        </p>
      </div>
    </div>
  )
}

/**
 * Page de STATUT publique (§2.2) — accessible sans authentification. Interroge le `/ready` du
 * backend (readiness : le process ET la base répondent, cf. §8.3) à l'ouverture et affiche un état
 * simple : opérationnel / incident / vérification. `/health` (liveness) resterait vert avec la base
 * à terre — d'où `/ready`, qui fait un `SELECT 1`. Donne
 * aussi un point de contact support. Volontairement minimale et sans dépendance : un utilisateur
 * qui n'arrive pas à se connecter doit pouvoir vérifier ici si le service est en cause.
 */
export function StatutPage() {
  const { t } = useTranslation()
  const [etat, setEtat] = useState<Etat>('verification')
  const [verifieLe, setVerifieLe] = useState<string | null>(null)
  const [incident, setIncident] = useState<IncidentPublic | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let actif = true
    void (async () => {
      try {
        // `/ready` renvoie 200 si la base répond, 503 sinon → `res.ok` distingue les deux.
        const res = await fetch(`${API_URL}/ready`, { signal: controller.signal })
        if (!actif) return
        setEtat(res.ok ? 'operationnel' : 'incident')
      } catch {
        if (actif) setEtat('incident')
      } finally {
        if (actif) setVerifieLe(new Date().toISOString())
      }
    })()
    return () => {
      actif = false
      controller.abort()
    }
  }, [])

  // Bannière d'incident publiée par le SUPER_ADMIN (indépendante de la sonde). Best-effort : en
  // cas d'échec, on n'affiche simplement rien — l'état sondé reste, sans conséquence.
  useEffect(() => {
    const controller = new AbortController()
    let vivant = true
    void statutApi
      .incidentPublic(controller.signal)
      .then((i) => {
        if (vivant) setIncident(i)
      })
      .catch(() => {})
    return () => {
      vivant = false
      controller.abort()
    }
  }, [])

  // Seuls l'icône et les tons sont figés ici ; les libellés sont résolus par `t()` au rendu
  // (convention §4 : pas de map de libellés figée au niveau module).
  const conf = {
    verification: { icon: Loader2, tone: 'text-faint', ring: 'border-hairline', spin: true },
    operationnel: { icon: CheckCircle2, tone: 'text-jade', ring: 'border-jade/30', spin: false },
    incident: { icon: AlertTriangle, tone: 'text-terra', ring: 'border-terra/30', spin: false },
  }[etat]
  const Icon = conf.icon

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
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
            {t('statut.accueil')}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <p className="text-2xs font-medium uppercase tracking-[0.14em] text-brass/80">
          {t('statut.overline')}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          {t('statut.titre')}
        </h1>

        {/* Bannière d'incident publiée (si active) — au-dessus de l'état sondé automatique. */}
        {incident && incident.actif && <BanniereIncident incident={incident} />}

        {/* Indicateur principal */}
        <div
          className={cn('mt-8 flex items-start gap-4 rounded-2xl border bg-surface/50 p-6', conf.ring)}
          role="status"
          aria-live="polite"
        >
          <Icon
            className={cn('mt-0.5 h-7 w-7 shrink-0', conf.tone, conf.spin && 'animate-spin')}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">
              {t(cleI18n(`statut.etats.${etat}.titre`))}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t(cleI18n(`statut.etats.${etat}.texte`))}
            </p>
            {verifieLe && (
              <p className="mt-2 text-xs text-faint">
                {t('statut.derniereVerification', { heure: formatDateHeure(verifieLe) })}
              </p>
            )}
          </div>
        </div>

        {/* Support */}
        <div className="mt-6 flex items-start gap-4 rounded-2xl border border-hairline bg-surface/50 p-6">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-brass">
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t('statut.support.titre')}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t('statut.support.texte')} {t('statut.support.invite')}{' '}
              <a
                href={`mailto:${CONTACT_SUPPORT}?subject=${encodeURIComponent(t('statut.support.sujetMail'))}`}
                className="text-brass underline-offset-2 hover:underline"
              >
                {CONTACT_SUPPORT}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

export default StatutPage
