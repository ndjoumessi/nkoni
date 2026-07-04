import { useEffect, useState, type FormEvent } from 'react'
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
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'

/** Nom affichable d'un membre (« Prénom Nom »). */
function nomMembre(m?: { nom: string; prenom: string }): string {
  return m ? `${m.prenom} ${m.nom}` : ''
}

/** Liste des fonctions/organes (§5) — titulaire actuel + taille d'historique. */
export function FonctionsPage() {
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
      toast.success('Fonction créée', cree.nom)
      fermerModal()
    } catch (err) {
      // 409 possible : nom déjà utilisé.
      toast.error(
        'Création impossible',
        err instanceof ApiError ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PageHeader
        overline="Organisation"
        title="Fonctions & organes"
        description={
          fonctions ? `${fonctions.length} fonction${fonctions.length > 1 ? 's' : ''}` : undefined
        }
        actions={
          gestion && (
            <Button type="button" icon={Plus} onClick={() => setCreerOuvert(true)}>
              Nouvelle fonction
            </Button>
          )
        }
      />

      <div className="nk-reveal nk-d2 mt-7">
        {loading && (
          <Card className="overflow-hidden p-0">
            <RowsSkeleton rows={4} />
          </Card>
        )}

        {!loading && error && (
          <Card className="border-terra/30 bg-terra/[0.07] p-5 text-terra">{error}</Card>
        )}

        {!loading && !error && fonctions && fonctions.length === 0 && (
          <EmptyState
            icon={Landmark}
            title="Aucune fonction"
            className="min-h-[45vh] justify-center"
            description={
              gestion
                ? 'Créez les organes de la famille (Président, Trésorier…) puis nommez leurs titulaires.'
                : 'Les fonctions de la famille apparaîtront ici.'
            }
            action={
              gestion && (
                <Button type="button" icon={Plus} onClick={() => setCreerOuvert(true)}>
                  Nouvelle fonction
                </Button>
              )
            }
            tips={[
              { icon: UserCheck, label: 'Un seul titulaire à la fois' },
              { icon: History, label: 'Historique des nominations' },
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
                            Vacant
                          </Badge>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-xs text-faint">
                          <History className="h-3.5 w-3.5" aria-hidden="true" />
                          {f._count.affectations} nomination
                          {f._count.affectations > 1 ? 's' : ''}
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
        <Modal open onClose={fermerModal} title="Nouvelle fonction">
          <form onSubmit={creerFonction} className="space-y-4">
            <Field label="Nom de la fonction" required>
              <Input
                autoFocus
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Président, Trésorier, Secrétaire…"
                maxLength={200}
              />
            </Field>
            <Field label="Description" hint="Optionnel.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Rôle et attributions de la fonction…"
                rows={3}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={fermerModal}>
                Annuler
              </Button>
              <Button type="submit" icon={Plus} loading={creating} disabled={nom.trim().length === 0}>
                Créer la fonction
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export default FonctionsPage
