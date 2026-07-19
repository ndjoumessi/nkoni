import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { CalendarPlus, CalendarRange, Check, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { baremeApi, contributionsApi, ApiError, messageErreur, type Bareme } from '@/lib/api'
import { peutVoirBareme, peutGererBareme, peutOuvrirAnnee } from '@/lib/roles'
import { focusPremierChampInvalide } from '@/lib/utils'
import { formatMontant } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { SelecteurAnnee } from '@/components/ui/SelecteurAnnee'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { RowsSkeleton } from '@/components/ui/Skeleton'

/**
 * Barème annuel (§4.2 / §5.3). Lecture : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE.
 * Écriture : ADMIN uniquement. Dernier maillon barème → ouverture d'année → versement.
 */
export function BaremePage() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const toast = useToast()
  const gestion = peutGererBareme(user?.role)

  const [baremes, setBaremes] = useState<Bareme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [annee, setAnnee] = useState(String(new Date().getFullYear()))
  const [montant, setMontant] = useState('')
  const [adding, setAdding] = useState(false)
  const [errAnnee, setErrAnnee] = useState<string | undefined>(undefined)
  const [errMontant, setErrMontant] = useState<string | undefined>(undefined)
  const ajoutRef = useRef<HTMLFormElement>(null)

  // Ouverture d'année pour toute l'organisation (action optionnelle de préparation d'exercice).
  const [anneeAOuvrir, setAnneeAOuvrir] = useState(String(new Date().getFullYear()))
  const [ouvrant, setOuvrant] = useState(false)

  const anneesAvecBareme = useMemo(() => new Set(baremes.map((b) => b.annee)), [baremes])
  /** Première année SANS barème à partir de l'année courante — défaut du formulaire d'ajout. */
  const premiereAnneeLibre = useMemo(() => {
    let a = new Date().getFullYear()
    while (anneesAvecBareme.has(a)) a += 1
    return a
  }, [anneesAvecBareme])
  /** Ajouter un barème sur une année déjà configurée renverrait un 409 : on le bloque en amont. */
  const anneeAjoutDejaPrise = anneesAvecBareme.has(Number(annee))
  /** Ouvrir une année exige un barème (sinon 400) : on le signale avant l'appel. */
  const anneeOuvrirSansBareme = !anneesAvecBareme.has(Number(anneeAOuvrir))
  /**
   * Une année FUTURE ne s'ouvre pas : sa contribution serait affichée et encaissable alors que le
   * montant attendu cumulé (borné à l'année courante) l'ignore → argent reçu invisible. Configurer
   * son barème à l'avance reste permis.
   */
  const anneeOuvrirFuture = Number(anneeAOuvrir) > new Date().getFullYear()

  // Défauts calés sur les données, une seule fois au premier chargement (ne pas écraser un choix
  // manuel ensuite) : ajout → première année libre ; ouverture → année configurée la plus récente.
  const defautsAppliques = useRef(false)
  useEffect(() => {
    if (defautsAppliques.current || baremes.length === 0) return
    defautsAppliques.current = true
    setAnnee(String(premiereAnneeLibre))
    // Défaut d'OUVERTURE : la dernière année de barème qui soit ÉCHUE. Viser le max absolu
    // proposerait une année future dès qu'un barème est configuré en avance (bug vécu : créer le
    // barème 2027 faisait pointer le sélecteur sur 2027, et l'ouvrir créait 35 contributions non dues).
    const courante = new Date().getFullYear()
    const echues = baremes.map((b) => b.annee).filter((a) => a <= courante)
    setAnneeAOuvrir(String(echues.length > 0 ? Math.max(...echues) : courante))
  }, [baremes, premiereAnneeLibre])

  const [editId, setEditId] = useState<string | null>(null)
  const [editMontant, setEditMontant] = useState('')
  const [errEdit, setErrEdit] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const editRef = useRef<HTMLInputElement>(null)

  /** Contrôle d'un montant attendu (≥ 0, requis). */
  const validerMontant = (v: string): string | undefined => {
    if (v.trim().length === 0) return t('bareme.erreurs.montantRequis')
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return t('bareme.erreurs.montantInvalide')
    return undefined
  }

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const list = await baremeApi.list(accessToken, controller.signal)
        if (active) setBaremes(list)
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

  if (!peutVoirBareme(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return

    // Validation inline par champ + focus sur le 1er en erreur (§8).
    const anneeNum = Number(annee)
    const eAnnee =
      annee.trim().length === 0
        ? t('bareme.erreurs.anneeRequise')
        : !Number.isInteger(anneeNum) || anneeNum < 1900 || anneeNum > 2200
          ? t('bareme.erreurs.anneeInvalide')
          : undefined
    const eMontant = validerMontant(montant)
    setErrAnnee(eAnnee)
    setErrMontant(eMontant)
    if (eAnnee || eMontant) {
      requestAnimationFrame(() => focusPremierChampInvalide(ajoutRef.current))
      return
    }
    setAdding(true)
    try {
      const cree = await baremeApi.create(Number(annee), Number(montant), accessToken)
      const suivants = [cree, ...baremes].sort((a, b) => b.annee - a.annee)
      setBaremes(suivants)
      setMontant('')
      // Réarme le champ sur la prochaine année LIBRE : sinon il resterait sur l'année qui vient
      // d'être créée, affichant aussitôt « un barème existe déjà » avec le bouton désactivé.
      const prises = new Set(suivants.map((b) => b.annee))
      let libre = new Date().getFullYear()
      while (prises.has(libre)) libre += 1
      setAnnee(String(libre))
      toast.success(
        t('bareme.toast.ajoute'),
        t('bareme.toast.detail', { annee: cree.annee, montant: formatMontant(cree.montantAttendu) }),
      )
    } catch (e) {
      toast.error(
        t('bareme.toast.ajoutImpossible'),
        e instanceof ApiError ? e.message : t('bareme.toast.ajoutEchec'),
      )
    } finally {
      setAdding(false)
    }
  }

  const demarrerEdition = (b: Bareme) => {
    setEditId(b.id)
    setEditMontant(String(b.montantAttendu))
    setErrEdit(undefined)
  }

  const enregistrerEdition = async (id: string) => {
    if (!accessToken) return
    const eEdit = validerMontant(editMontant)
    setErrEdit(eEdit)
    if (eEdit) {
      requestAnimationFrame(() => editRef.current?.focus())
      return
    }
    setSaving(true)
    try {
      const maj = await baremeApi.update(id, Number(editMontant), accessToken)
      setBaremes((prev) => prev.map((b) => (b.id === id ? maj : b)))
      setEditId(null)
      toast.success(
        t('bareme.toast.miseAJour'),
        t('bareme.toast.detail', { annee: maj.annee, montant: formatMontant(maj.montantAttendu) }),
      )
    } catch (e) {
      toast.error(
        t('bareme.toast.majImpossible'),
        e instanceof ApiError ? e.message : t('bareme.toast.majEchec'),
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Ouvre l'année pour TOUS les membres éligibles (préparation d'exercice). Idempotent côté
   * serveur ; un barème doit exister pour l'année (sinon 400 explicite).
   */
  const handleOuvrirAnnee = async () => {
    if (!accessToken) return
    setOuvrant(true)
    try {
      const res = await contributionsApi.ouvrirAnnee(Number(anneeAOuvrir), accessToken)
      // L'opération est idempotente : rouvrir une année déjà ouverte ne crée rien. On le dit
      // franchement au lieu d'un « Année ouverte » vert qui laisse croire à une action effective.
      // (Rouvrir reste utile : cela crée la contribution des membres ajoutés APRÈS la 1ʳᵉ ouverture.)
      if (res.contributionsCreees === 0) {
        toast.info(
          t('bareme.ouvrir.toastAucuneTitre'),
          t('bareme.ouvrir.toastAucuneDetail', { annee: res.annee, eligibles: res.membresEligibles }),
        )
      } else {
        toast.success(
          t('bareme.ouvrir.toastTitre', { annee: res.annee }),
          t('bareme.ouvrir.toastDetail', {
            crees: res.contributionsCreees,
            eligibles: res.membresEligibles,
          }),
        )
      }
    } catch (e) {
      toast.error(
        t('bareme.ouvrir.toastErreur'),
        e instanceof ApiError ? e.message : messageErreur(e),
      )
    } finally {
      setOuvrant(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        overline={t('bareme.overline')}
        title={t('bareme.titre')}
        description={t('bareme.description', {
          suffixe: gestion ? '' : t('bareme.lectureSeule'),
        })}
      />

      {gestion && (
        <Card className="nk-reveal nk-d2 mt-7 p-5">
          <form ref={ajoutRef} onSubmit={handleAdd} noValidate>
            <Overline>{t('bareme.ajouterAnnee')}</Overline>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <Field label={t('bareme.anneeLabel')} required className="w-32" error={errAnnee}>
                <SelecteurAnnee
                  value={Number(annee) || new Date().getFullYear()}
                  min={1900}
                  max={2200}
                  onChange={(a) => {
                    setAnnee(String(a))
                    setErrAnnee(undefined)
                  }}
                />
              </Field>
              <Field label={t('bareme.montantLabel')} required className="flex-1" error={errMontant}>
                <Input
                  type="number"
                  min={0}
                  value={montant}
                  onChange={(e) => {
                    setMontant(e.target.value)
                    setErrMontant(undefined)
                  }}
                />
              </Field>
              {/* Label fantôme : cale le bouton exactement au niveau des champs (§8),
                  indépendamment des messages d'erreur qui poussent la hauteur en dessous. */}
              <div className="flex flex-col">
                {/* Mêmes classes que le label de Field → hauteur identique, bouton aligné. */}
                <span
                  className="mb-1.5 flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.1em]"
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
                <Button type="submit" icon={Plus} loading={adding} disabled={anneeAjoutDejaPrise}>
                  {t('bareme.ajouter')}
                </Button>
              </div>
            </div>
            {/* Message PLEINE LARGEUR (et non dans le champ `w-32`, où il se tasserait sur 4 lignes). */}
            {anneeAjoutDejaPrise && (
              <p className="mt-3 text-sm text-terra" role="status">
                {t('bareme.erreurs.anneeDejaConfiguree')}
              </p>
            )}
          </form>
        </Card>
      )}

      {/* Ouvrir une année pour TOUTE l'organisation (ADMIN + TRESORIERE). Placée ici — et non dans
          le formulaire de versement — parce que c'est une action d'ORGANISATION qui prolonge
          directement la configuration du barème (barème de l'année → ouverture → versements).
          Elle reste OPTIONNELLE : encaisser une année non ouverte l'ouvre à la volée pour le membre
          concerné (cf. `ouvrirAnneeMembre`). Sert à préparer l'exercice en une fois. */}
      {peutOuvrirAnnee(user?.role) && (
        <Card className="nk-reveal nk-d2 mt-4 p-5">
          <Overline>{t('bareme.ouvrir.titre')}</Overline>
          <p className="mt-1.5 text-xs text-faint">{t('bareme.ouvrir.hint')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* Bornes 1900–2200 alignées sur le schéma backend d'ouvrir-annee. */}
            <SelecteurAnnee
              value={Number(anneeAOuvrir) || new Date().getFullYear()}
              min={1900}
              max={2200}
              onChange={(a) => setAnneeAOuvrir(String(a))}
              className="w-32"
              aria-label={t('bareme.ouvrir.anneeAria')}
            />
            <Button
              variant="outline"
              icon={CalendarPlus}
              loading={ouvrant}
              disabled={anneeOuvrirSansBareme || anneeOuvrirFuture}
              onClick={handleOuvrirAnnee}
            >
              {t('bareme.ouvrir.bouton')}
            </Button>
          </div>
          {/* Motifs de blocage dits AVANT l'appel (sinon 400 opaque). L'année future prime : c'est
              le cas le plus fréquent quand un barème a été configuré en avance. */}
          {anneeOuvrirFuture ? (
            <p className="mt-3 text-sm text-terra">{t('bareme.ouvrir.anneeFuture')}</p>
          ) : (
            anneeOuvrirSansBareme && (
              <p className="mt-3 text-sm text-terra">{t('bareme.ouvrir.sansBareme')}</p>
            )
          )}
        </Card>
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

        {!loading && !error && baremes.length === 0 && (
          <EmptyState
            icon={CalendarRange}
            title={t('bareme.videTitre')}
            description={
              gestion
                ? t('bareme.videDescriptionGestion')
                : t('bareme.videDescription')
            }
          />
        )}

        {!loading && !error && baremes.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-[1fr_2fr_auto] gap-4 border-b border-hairline px-5 py-3 text-2xs font-medium uppercase tracking-[0.12em] text-faint">
              <span>{t('bareme.colonneAnnee')}</span>
              <span>{t('bareme.colonneMontant')}</span>
              <span className="sr-only">{t('bareme.colonneActions')}</span>
            </div>
            <ul className="divide-y divide-hairline">
              {baremes.map((b) => (
                <li
                  key={b.id}
                  className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 px-5 py-3.5"
                >
                  <span className="num font-medium text-foreground">{b.annee}</span>
                  {editId === b.id ? (
                    <div>
                      <Input
                        ref={editRef}
                        type="number"
                        min={0}
                        value={editMontant}
                        onChange={(e) => {
                          setEditMontant(e.target.value)
                          setErrEdit(undefined)
                        }}
                        aria-label={t('bareme.montantAria', { annee: b.annee })}
                        aria-invalid={errEdit ? true : undefined}
                        aria-describedby={errEdit ? `edit-err-${b.id}` : undefined}
                      />
                      {errEdit && (
                        <span
                          id={`edit-err-${b.id}`}
                          role="alert"
                          className="mt-1 block text-xs text-terra"
                        >
                          {errEdit}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="num text-sm text-foreground/85">
                      {formatMontant(b.montantAttendu)}
                    </span>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    {gestion && editId === b.id ? (
                      <>
                        <Button
                          variant="jade"
                          size="sm"
                          onClick={() => enregistrerEdition(b.id)}
                          loading={saving}
                          icon={saving ? undefined : Check}
                        >
                          {t('bareme.enregistrer')}
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(null)
                            setErrEdit(undefined)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={t('bareme.annulerAria')}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : gestion ? (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Pencil}
                        onClick={() => demarrerEdition(b)}
                      >
                        {t('bareme.modifier')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}

export default BaremePage
