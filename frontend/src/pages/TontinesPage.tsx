import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { CircleDollarSign, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { tontinesApi, messageErreur, type Tontine, type ModeRotation } from '@/lib/api'
import { peutVoirTontines, peutGererTontines } from '@/lib/roles'
import { cleI18n } from '@/lib/i18n'
import { staggerDelay } from '@/lib/utils'
import { Montant } from '@/components/ui/Montant'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

const MODES: ModeRotation[] = ['ORDRE_FIXE', 'TIRAGE', 'ENCHERE']

/** Liste des tontines (§ tontine) + création réservée aux rôles de gestion. */
export function TontinesPage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()

  const gestion = peutGererTontines(user?.role)

  const [items, setItems] = useState<Tontine[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Création.
  const [modalOuverte, setModalOuverte] = useState(false)
  const [nom, setNom] = useState('')
  const [montant, setMontant] = useState('')
  const [mode, setMode] = useState<ModeRotation>('ORDRE_FIXE')
  const [envoi, setEnvoi] = useState(false)
  const [errNom, setErrNom] = useState<string | undefined>(undefined)
  const [errMontant, setErrMontant] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const data = await tontinesApi.list(accessToken, controller.signal)
        if (actif) setItems(data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (actif) setError(messageErreur(e))
      } finally {
        if (actif) setLoading(false)
      }
    })()
    return () => {
      actif = false
      controller.abort()
    }
  }, [accessToken])

  if (!peutVoirTontines(user?.role)) return <Navigate to="/dashboard" replace />

  const reinitialiser = () => {
    setNom('')
    setMontant('')
    setMode('ORDRE_FIXE')
    setErrNom(undefined)
    setErrMontant(undefined)
  }

  const creer = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    const nomPropre = nom.trim()
    const montantNombre = Number(montant)
    setErrNom(nomPropre ? undefined : t('tontines.creation.nomRequis'))
    setErrMontant(
      Number.isFinite(montantNombre) && montantNombre > 0
        ? undefined
        : t('tontines.creation.montantInvalide'),
    )
    if (!nomPropre || !(Number.isFinite(montantNombre) && montantNombre > 0)) return

    setEnvoi(true)
    try {
      const creee = await tontinesApi.create(
        { nom: nomPropre, montantBaseMise: montantNombre, modeRotation: mode },
        accessToken,
      )
      setItems((liste) => [creee, ...(liste ?? [])])
      setModalOuverte(false)
      reinitialiser()
      toast.success(t('tontines.creation.succes'))
    } catch (err) {
      toast.error(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  const boutonNouvelle = gestion ? (
    <Button type="button" icon={Plus} onClick={() => setModalOuverte(true)}>
      {t('tontines.liste.nouvelle')}
    </Button>
  ) : undefined

  return (
    <>
      <PageHeader
        overline={t('tontines.liste.overline')}
        title={t('tontines.liste.titre')}
        description={t('tontines.liste.sousTitre')}
        actions={items && items.length > 0 ? boutonNouvelle : undefined}
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
            icon={CircleDollarSign}
            title={t('tontines.liste.videTitre')}
            className="min-h-[45vh] justify-center"
            description={
              gestion ? t('tontines.liste.videTexte') : t('tontines.liste.videTexteLecture')
            }
            action={boutonNouvelle}
          />
        )}

        {!loading && !error && items && items.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((tontine, i) => (
              <li key={tontine.id} className="nk-reveal" style={staggerDelay(i)}>
                <Link
                  to={`/tontines/${tontine.id}`}
                  className="group block h-full rounded-2xl border border-hairline bg-surface/60 p-5 transition-colors hover:border-hairline-strong hover:bg-surface-2/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-medium text-foreground">{tontine.nom}</h2>
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={{
                        color: 'var(--brass)',
                        borderColor: 'color-mix(in oklch, var(--brass) 30%, transparent)',
                        backgroundColor: 'color-mix(in oklch, var(--brass) 8%, transparent)',
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t(cleI18n(`tontines.modes.${tontine.modeRotation}`))}
                    </span>
                  </div>
                  <dl className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                    <div>
                      <dt className="text-xs text-faint">{t('tontines.liste.colonneMise')}</dt>
                      <dd className="mt-0.5">
                        <Montant value={tontine.montantBaseMise} className="text-lg" />
                      </dd>
                    </div>
                    <div>
                      <dd className="text-sm text-muted-foreground">
                        {t('tontines.liste.colonneCycles', { count: tontine._count.cycles })}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={modalOuverte}
        onClose={() => {
          setModalOuverte(false)
          reinitialiser()
        }}
        title={t('tontines.creation.titre')}
      >
        <form onSubmit={creer} className="space-y-4" noValidate>
          <Field label={t('tontines.creation.nom')} error={errNom}>
            <Input
              id="tontine-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder={t('tontines.creation.nomPlaceholder')}
              autoFocus
            />
          </Field>
          <Field
            label={t('tontines.creation.montantBaseMise')}
            error={errMontant}
            hint={t('tontines.creation.montantAide')}
          >
            <Input
              id="tontine-montant"
              type="number"
              min={1}
              inputMode="numeric"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
            />
          </Field>
          <Field
            label={t('tontines.creation.modeRotation')}
            hint={t(cleI18n(`tontines.modesAide.${mode}`))}
          >
            <Select
              id="tontine-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeRotation)}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {t(cleI18n(`tontines.modes.${m}`))}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalOuverte(false)
                reinitialiser()
              }}
            >
              {t('tontines.creation.annuler')}
            </Button>
            <Button type="submit" loading={envoi}>
              {t('tontines.creation.creer')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default TontinesPage
