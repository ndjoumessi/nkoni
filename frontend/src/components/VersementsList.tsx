import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  versementsApi,
  recusApi,
  ApiError,
  type Versement,
  type Recu,
  type ModeVersement,
} from '@/lib/api'
import { formatFcfa } from '@/lib/format'

const MODE_LABEL: Record<ModeVersement, string> = {
  ESPECES: 'Espèces',
  TIERS: 'Tiers',
  AUTRE: 'Autre',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR')
}

/**
 * Liste des versements d'une contribution (GET /versements?contributionId=) avec, pour
 * chaque versement, le numéro de reçu s'il existe déjà, sinon un bouton « Générer le
 * reçu » (POST /versements/:id/recu — jamais automatique, §4.6).
 *
 * Les reçus existants sont récupérés en une fois via GET /recus?membreId= (pas de N+1).
 */
export function VersementsList({
  contributionId,
  membreId,
}: {
  contributionId: string
  membreId: string
}) {
  const { accessToken } = useAuth()
  const [versements, setVersements] = useState<Versement[]>([])
  const [recus, setRecus] = useState<Map<string, Recu>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

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
    setGenError(null)
    setGenerating(versementId)
    try {
      const recu = await recusApi.generer(versementId, accessToken)
      setRecus((prev) => new Map(prev).set(versementId, recu))
    } catch (e) {
      setGenError(e instanceof ApiError ? e.message : 'Échec de la génération du reçu.')
    } finally {
      setGenerating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Chargement des versements…
      </div>
    )
  }

  if (error) {
    return <p className="px-4 py-3 text-sm text-rose-300">{error}</p>
  }

  if (versements.length === 0) {
    return <p className="px-4 py-3 text-sm text-white/40">Aucun versement pour cette année.</p>
  }

  return (
    <div className="space-y-2 px-1 py-2">
      {genError && <p className="px-3 text-sm text-rose-300">{genError}</p>}
      {versements.map((v) => {
        const recu = recus.get(v.id)
        return (
          <div
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {formatFcfa(v.montant)}
                <span className="ml-2 text-xs font-normal text-white/45">
                  {formatDate(v.dateVersement)} · {MODE_LABEL[v.mode]}
                </span>
              </p>
              {v.note && <p className="mt-0.5 truncate text-xs text-white/45">{v.note}</p>}
            </div>
            {recu ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Reçu {recu.numero}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => genererRecu(v.id)}
                disabled={generating === v.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
              >
                {generating === v.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Générer le reçu
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default VersementsList
