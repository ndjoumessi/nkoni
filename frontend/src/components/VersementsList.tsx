import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  versementsApi,
  recusApi,
  ApiError,
  type Versement,
  type Recu,
} from '@/lib/api'
import { formatFcfa } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR')
}

/**
 * Liste des versements d'une contribution avec, pour chacun, le numéro de reçu s'il
 * existe déjà, sinon un bouton « Générer le reçu » (§4.6, jamais automatique).
 * Les reçus existants sont récupérés en une fois via GET /recus?membreId= (pas de N+1).
 */
export function VersementsList({
  contributionId,
  membreId,
}: {
  contributionId: string
  membreId: string
}) {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()
  const [versements, setVersements] = useState<Versement[]>([])
  const [recus, setRecus] = useState<Map<string, Recu>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    const { signal } = controller
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [vs, rs] = await Promise.all([
          versementsApi.listByContribution(contributionId, accessToken, signal),
          recusApi.listByMembre(membreId, accessToken, signal),
        ])
        if (!active) return
        setVersements(vs)
        setRecus(new Map(rs.map((r) => [r.versementId, r])))
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(e instanceof ApiError ? e.message : 'Erreur de chargement.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, contributionId, membreId])

  const genererRecu = async (versementId: string) => {
    if (!accessToken) return
    setGenerating(versementId)
    try {
      const recu = await recusApi.generer(versementId, accessToken)
      setRecus((prev) => new Map(prev).set(versementId, recu))
      toast.success(t('versements.toast.recuGenere'), t('versements.toast.recuNumero', { numero: recu.numero }))
    } catch (e) {
      toast.error(
        t('versements.toast.generationImpossible'),
        e instanceof ApiError ? e.message : t('versements.toast.generationEchec'),
      )
    } finally {
      setGenerating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-brass" aria-hidden="true" />
        {t('versements.liste.chargement')}
      </div>
    )
  }

  if (error) {
    return <p className="px-4 py-3 text-sm text-terra">{error}</p>
  }

  if (versements.length === 0) {
    return <p className="px-4 py-3 text-sm text-faint">{t('versements.liste.aucun')}</p>
  }

  return (
    <div className="space-y-2 px-3 py-3">
      {versements.map((v) => {
        const recu = recus.get(v.id)
        return (
          <div
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="num text-sm font-medium text-foreground">
                {formatFcfa(v.montant)}
                <span className="ml-2 text-xs font-normal text-faint">
                  {formatDate(v.dateVersement)} · {t(`versements.modes.${v.mode}`)}
                </span>
              </p>
              {v.note && <p className="mt-0.5 truncate text-xs text-faint">{v.note}</p>}
            </div>
            {recu ? (
              <Badge tone="jade" size="sm">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {t('versements.liste.recu', { numero: recu.numero })}
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={FileText}
                loading={generating === v.id}
                onClick={() => genererRecu(v.id)}
              >
                {t('versements.liste.generer')}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default VersementsList
