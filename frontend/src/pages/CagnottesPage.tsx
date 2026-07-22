import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { HeartHandshake, Plus, Target, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { cagnottesApi, messageErreur, type Cagnotte } from '@/lib/api'
import { peutVoirCagnottes, peutGererCagnotte } from '@/lib/roles'
import { Montant } from '@/components/ui/Montant'
import { staggerDelay } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

const TONE_TYPE: Record<Cagnotte['type'], string> = {
  DEUIL: 'border-hairline bg-surface-2/60 text-muted-foreground',
  MARIAGE: 'border-brass/30 bg-brass/[0.08] text-brass',
  NAISSANCE: 'border-jade/30 bg-jade/[0.08] text-jade',
  AUTRE: 'border-hairline bg-surface-2/60 text-muted-foreground',
}

function BarreProgression({ pct }: { pct: number }) {
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-gradient-to-r from-jade to-brass transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function CarteCagnotte({ c }: { c: Cagnotte }) {
  const { t } = useTranslation()
  return (
    <Link
      to={`/cagnottes/${c.id}`}
      className="group block rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:border-hairline-strong hover:bg-surface-2/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_TYPE[c.type]}`}>
          {t(`cagnottes.types.${c.type}`)}
        </span>
        {c.nbDons > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-faint">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {t('cagnottes.liste.dons', { count: c.nbDons })}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-lg font-semibold text-foreground">{c.titre}</p>
      {c.beneficiaire && (
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('cagnottes.liste.beneficiaire')} : {c.beneficiaire}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xl font-semibold text-foreground"><Montant value={c.collecte} /></p>
          <p className="text-xs text-faint">{t('cagnottes.liste.collecte')}</p>
        </div>
        {c.objectif != null ? (
          <div className="text-right">
            <p className="text-sm text-muted-foreground"><Montant value={c.objectif} /></p>
            <p className="inline-flex items-center gap-1 text-xs text-faint">
              <Target className="h-3 w-3" aria-hidden="true" />
              {t('cagnottes.liste.objectif')}
            </p>
          </div>
        ) : (
          <span className="text-xs text-faint">{t('cagnottes.liste.sansObjectif')}</span>
        )}
      </div>
      {c.progression != null && <BarreProgression pct={c.progression} />}
    </Link>
  )
}

/** Liste des cagnottes d'événement (§4.9) — en cours puis clôturées. */
export function CagnottesPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()

  const [items, setItems] = useState<Cagnotte[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const gestion = peutGererCagnotte(user?.role)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await cagnottesApi.list(accessToken, controller.signal)
        if (active) setItems(data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(messageErreur(e))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken])

  if (!peutVoirCagnottes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const ouvertes = items?.filter((c) => c.statut === 'OUVERTE') ?? []
  const cloturees = items?.filter((c) => c.statut === 'CLOTUREE') ?? []

  return (
    <>
      <PageHeader
        overline={t('cagnottes.liste.overline')}
        title={t('cagnottes.liste.titre')}
        description={t('cagnottes.liste.sousTitre')}
        actions={
          gestion && items && items.length > 0 ? (
            <ButtonLink to="/cagnottes/nouvelle" icon={Plus}>
              {t('cagnottes.liste.nouvelle')}
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="nk-reveal nk-d2 mt-7">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <ErrorState title={t('commun.erreurs.chargementImpossible')} description={error} />
        )}

        {!loading && !error && items && items.length === 0 && (
          <EmptyState
            icon={HeartHandshake}
            title={t('cagnottes.liste.empty.titre')}
            className="min-h-[45vh] justify-center"
            description={t('cagnottes.liste.empty.description')}
            action={
              gestion && (
                <ButtonLink to="/cagnottes/nouvelle" icon={Plus}>
                  {t('cagnottes.liste.empty.action')}
                </ButtonLink>
              )
            }
          />
        )}

        {!loading && !error && items && items.length > 0 && (
          <div className="space-y-8">
            {ouvertes.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
                  {t('cagnottes.liste.sectionOuvertes')}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ouvertes.map((c, i) => (
                    <div key={c.id} className="nk-reveal" style={staggerDelay(i)}>
                      <CarteCagnotte c={c} />
                    </div>
                  ))}
                </div>
              </section>
            )}
            {cloturees.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
                  {t('cagnottes.liste.sectionCloturees')}
                </h2>
                <div className="grid gap-3 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                  {cloturees.map((c, i) => (
                    <div key={c.id} className="nk-reveal" style={staggerDelay(i)}>
                      <CarteCagnotte c={c} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default CagnottesPage
