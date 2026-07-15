import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { History, Landmark, Plus, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  fonctionsApi,
  ApiError,
  messageErreur,
  type FonctionListItem,
} from '@/lib/api'
import { peutVoirFonctions, peutGererFonctions } from '@/lib/roles'
import { staggerDelay } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

/** Nom affichable d'un membre (« Prénom Nom »). */
function nomMembre(m?: { nom: string; prenom: string }): string {
  return m ? `${m.prenom} ${m.nom}` : ''
}

/** Liste des fonctions/organes (§5) — titulaire actuel + taille d'historique. */
export function FonctionsPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const [fonctions, setFonctions] = useState<FonctionListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal de création.
  const [creerOuvert, setCreerOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const gestion = peutGererFonctions(user?.role)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await fonctionsApi.list(accessToken, controller.signal)
        if (active) setFonctions(data)
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

  if (!peutVoirFonctions(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const fermerModal = () => {
    setCreerOuvert(false)
    setNom('')
    setDescription('')
  }

  const creerFonction = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || nom.trim().length === 0) return
    setCreating(true)
    try {
      const cree = await fonctionsApi.create(
        { nom: nom.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
        accessToken,
      )
      // Nouvelle fonction : encore sans titulaire ni historique.
      const item: FonctionListItem = { ...cree, affectations: [], _count: { affectations: 0 } }
      setFonctions((prev) =>
        [...(prev ?? []), item].sort((a, b) => a.nom.localeCompare(b.nom)),
      )
      toast.success(t('fonctions.toast.creee'), cree.nom)
      fermerModal()
    } catch (err) {
      // 409 possible : nom déjà utilisé.
      toast.error(
        t('fonctions.toast.creationImpossible'),
        err instanceof ApiError ? err.message : t('fonctions.toast.reessayer'),
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PageHeader
        overline={t('fonctions.overline')}
        title={t('fonctions.liste.titre')}
        description={
          fonctions ? t('fonctions.liste.compteur', { count: fonctions.length }) : undefined
        }
        actions={
          // Masqué quand la liste est vide : l'EmptyState porte déjà le CTA (pas de doublon).
          gestion && (!fonctions || fonctions.length > 0) && (
            <Button type="button" icon={Plus} onClick={() => setCreerOuvert(true)}>
              {t('fonctions.actions.nouvelle')}
            </Button>
          )
        }
      />

      {fonctions && fonctions.length > 0 && (
        <div className="nk-reveal nk-d2 mt-7 grid grid-cols-3 gap-3">
          <StatCard label={t('fonctions.stats.total')} value={String(fonctions.length)} icon={Landmark} />
          <StatCard
            label={t('fonctions.stats.occupees')}
            value={String(fonctions.filter((f) => f.affectations[0]?.membre).length)}
            tone="jade"
            icon={UserCheck}
          />
          <StatCard
            label={t('fonctions.stats.vacantes')}
            value={String(fonctions.filter((f) => !f.affectations[0]?.membre).length)}
            icon={UserX}
          />
        </div>
      )}

      <div className="nk-reveal nk-d3 mt-6">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <ErrorState title={t('commun.erreurs.chargementImpossible')} description={error} />
        )}

        {!loading && !error && fonctions && fonctions.length === 0 && (
          <EmptyState
            icon={Landmark}
            title={t('fonctions.vide.titre')}
            className="min-h-[45vh] justify-center"
            description={
              gestion
                ? t('fonctions.vide.descriptionGestion')
                : t('fonctions.vide.description')
            }
            action={
              gestion && (
                <Button type="button" icon={Plus} onClick={() => setCreerOuvert(true)}>
                  {t('fonctions.actions.nouvelle')}
                </Button>
              )
            }
            tips={[
              { icon: UserCheck, label: t('fonctions.vide.tips.titulaireUnique') },
              { icon: History, label: t('fonctions.vide.tips.historique') },
            ]}
          />
        )}

        {!loading && !error && fonctions && fonctions.length > 0 && (
          <ul className="space-y-3">
            {fonctions.map((f, i) => {
              const titulaire = f.affectations[0]?.membre
              return (
                <li key={f.id} className="nk-reveal" style={staggerDelay(i)}>
                  <Link
                    to={`/fonctions/${f.id}`}
                    className="group block rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:border-hairline-strong hover:bg-surface-2/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                          <Landmark className="h-4 w-4 text-brass" aria-hidden="true" />
                          {f.nom}
                        </p>
                        {f.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {f.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {titulaire ? (
                          <Badge tone="jade" dot>
                            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {nomMembre(titulaire)}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('fonctions.badge.vacant')}
                          </Badge>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-xs text-faint">
                          <History className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('affectations.compteur', { count: f._count.affectations })}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {creerOuvert && (
        <Modal open onClose={fermerModal} title={t('fonctions.creer.titre')}>
          <form onSubmit={creerFonction} className="space-y-4">
            <Field label={t('fonctions.creer.nomLabel')} required>
              <Input
                autoFocus
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={t('fonctions.creer.nomPlaceholder')}
                maxLength={200}
              />
            </Field>
            <Field label={t('fonctions.creer.descriptionLabel')} hint={t('fonctions.champ.optionnel')}>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('fonctions.creer.descriptionPlaceholder')}
                rows={3}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={fermerModal}>
                {t('fonctions.actions.annuler')}
              </Button>
              <Button type="submit" icon={Plus} loading={creating} disabled={nom.trim().length === 0}>
                {t('fonctions.creer.soumettre')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export default FonctionsPage
