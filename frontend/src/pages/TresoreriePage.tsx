import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Wallet, ArrowUpCircle, ArrowDownCircle, Check, X, BadgeCheck, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  depensesApi,
  ApiError,
  messageErreur,
  type Depense,
  type SoldeTresorerie,
  type StatutDepense,
  type CategorieDepense,
  type FiltreDepenses,
} from '@/lib/api'
import { peutGererDepense, peutApprouverDepense, peutMarquerPayee } from '@/lib/roles'
import { formatMontant } from '@/lib/format'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Overline } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Field'
import { DatePicker } from '@/components/ui/DatePicker'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RowsSkeleton } from '@/components/ui/Skeleton'

const CATEGORIES: CategorieDepense[] = ['AIDE_MEMBRE', 'FUNERAILLES', 'EVENEMENT', 'FONCTIONNEMENT', 'AUTRE']
const STATUTS: StatutDepense[] = ['BROUILLON', 'EN_ATTENTE', 'APPROUVEE', 'REJETEE', 'PAYEE']
const TON_STATUT: Record<StatutDepense, 'neutral' | 'amber' | 'info' | 'terra' | 'jade'> = {
  BROUILLON: 'neutral',
  EN_ATTENTE: 'amber',
  APPROUVEE: 'info',
  REJETEE: 'terra',
  PAYEE: 'jade',
}
const SELECT_CLS =
  'rounded-lg border border-hairline-strong bg-surface-2 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60'

export function TresoreriePage() {
  const { t } = useTranslation()
  const { accessToken, user } = useAuth()
  const toast = useToast()

  const [solde, setSolde] = useState<SoldeTresorerie | null>(null)
  const [depenses, setDepenses] = useState<Depense[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtreStatut, setFiltreStatut] = useState<StatutDepense | ''>('')
  const [filtreCategorie, setFiltreCategorie] = useState<CategorieDepense | ''>('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [editDepense, setEditDepense] = useState<Depense | null>(null)
  const [rejet, setRejet] = useState<Depense | null>(null)

  const gestion = peutGererDepense(user?.role)
  const approbation = peutApprouverDepense(user?.role)
  const paiement = peutMarquerPayee(user?.role)

  const filtre: FiltreDepenses = useMemo(
    () => ({ ...(filtreStatut ? { statut: filtreStatut } : {}), ...(filtreCategorie ? { categorie: filtreCategorie } : {}) }),
    [filtreStatut, filtreCategorie],
  )

  const recharger = async () => {
    if (!accessToken) return
    try {
      const [s, d] = await Promise.all([depensesApi.solde({}, accessToken), depensesApi.list(filtre, accessToken)])
      setSolde(s)
      setDepenses(d)
    } catch (e) {
      toast.error(t('tresorerie.toast.erreur'), messageErreur(e))
    }
  }

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let actif = true
    setLoading(true)
    setErreur(null)
    void (async () => {
      try {
        const [s, d] = await Promise.all([
          depensesApi.solde({}, accessToken, controller.signal),
          depensesApi.list(filtre, accessToken, controller.signal),
        ])
        if (!actif) return
        setSolde(s)
        setDepenses(d)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (actif) setErreur(messageErreur(e))
      } finally {
        if (actif) setLoading(false)
      }
    })()
    return () => {
      actif = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filtreStatut, filtreCategorie])

  /* --- Actions workflow --- */
  const agir = async (action: () => Promise<unknown>, messageOk: string) => {
    if (!accessToken) return
    try {
      await action()
      toast.success(messageOk)
      await recharger()
    } catch (e) {
      toast.error(t('tresorerie.toast.erreur'), e instanceof ApiError ? e.message : messageErreur(e))
    }
  }

  const confirmerRejet = async (motif: string) => {
    if (!rejet || !accessToken) return
    await agir(() => depensesApi.rejeter(rejet.id, motif, accessToken), t('tresorerie.toast.rejetee'))
    setRejet(null)
  }

  const cat = (c: CategorieDepense) => t(`tresorerie.categories.${c}`)

  const colonnes: Column<Depense>[] = [
    { key: 'date', header: t('tresorerie.liste.date'), cell: (d) => formatDate(d.date) },
    { key: 'description', header: t('tresorerie.liste.description'), cell: (d) => d.description },
    { key: 'categorie', header: t('tresorerie.liste.categorie'), cell: (d) => cat(d.categorie) },
    { key: 'montant', header: t('tresorerie.liste.montant'), numeric: true, cell: (d) => formatMontant(d.montant) },
    {
      key: 'statut',
      header: t('tresorerie.liste.statut'),
      cell: (d) => (
        <Badge tone={TON_STATUT[d.statut]} size="sm">
          {t(`tresorerie.statuts.${d.statut}`)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {gestion && (d.statut === 'BROUILLON' || d.statut === 'EN_ATTENTE') && (
            <Button
              variant="ghost"
              size="sm"
              icon={Pencil}
              aria-label={t('tresorerie.actions.modifier')}
              title={t('tresorerie.actions.modifier')}
              onClick={() => setEditDepense(d)}
            />
          )}
          {approbation && d.statut === 'EN_ATTENTE' && (
            <>
              <Button variant="ghost" size="sm" icon={Check} onClick={() => agir(() => depensesApi.approuver(d.id, accessToken!), t('tresorerie.toast.approuvee'))}>
                {t('tresorerie.actions.approuver')}
              </Button>
              <Button variant="ghost" size="sm" icon={X} onClick={() => setRejet(d)}>
                {t('tresorerie.actions.rejeter')}
              </Button>
            </>
          )}
          {paiement && d.statut === 'APPROUVEE' && (
            <Button variant="ghost" size="sm" icon={BadgeCheck} onClick={() => agir(() => depensesApi.marquerPayee(d.id, accessToken!), t('tresorerie.toast.payee'))}>
              {t('tresorerie.actions.marquerPayee')}
            </Button>
          )}
          {gestion && d.statut === 'BROUILLON' && (
            <>
              <Button variant="ghost" size="sm" icon={ArrowUpCircle} onClick={() => agir(() => depensesApi.update(d.id, { statut: 'EN_ATTENTE' }, accessToken!), t('tresorerie.toast.creee'))}>
                {t('tresorerie.actions.soumettre')}
              </Button>
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => agir(() => depensesApi.remove(d.id, accessToken!), t('tresorerie.toast.supprimee'))}>
                {t('tresorerie.actions.supprimer')}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  const maxCat = solde ? Math.max(1, ...solde.parCategorie.map((c) => c.total)) : 1

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('tresorerie.titre')}
        description={t('tresorerie.sousTitre')}
        actions={gestion && <Button icon={Plus} onClick={() => setFormOuvert(true)}>{t('tresorerie.actions.nouvelle')}</Button>}
      />

      {!loading && erreur && (
        <Card role="alert" className="nk-reveal mt-4 border-terra/30 bg-terra/[0.07] p-5 text-terra">
          {erreur}
        </Card>
      )}

      {/* Solde */}
      {solde && (
        <div className="nk-reveal nk-d2 mt-6 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('tresorerie.solde.entrees')} value={formatMontant(solde.entrees)} tone="jade" icon={ArrowDownCircle} />
          <StatCard label={t('tresorerie.solde.sorties')} value={formatMontant(solde.sorties)} tone="brass" icon={ArrowUpCircle} />
          <StatCard label={t('tresorerie.solde.solde')} value={formatMontant(solde.solde)} icon={Wallet} />
        </div>
      )}

      {/* Ventilation par catégorie (barres labellisées → pas d'encodage couleur seul) */}
      {solde && (
        <Card className="nk-reveal nk-d3 mt-4 p-6">
          <Overline>{t('tresorerie.ventilation.titre')}</Overline>
          {solde.parCategorie.length === 0 ? (
            <p className="mt-4 text-sm text-faint">{t('tresorerie.ventilation.aucune')}</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {solde.parCategorie.map((c) => (
                <li key={c.categorie} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{cat(c.categorie)}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-brass/70" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                  </span>
                  <span className="num text-right text-foreground">{formatMontant(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Liste + filtres */}
      <Card className="nk-reveal nk-d4 mt-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Overline>{t('tresorerie.liste.titre')}</Overline>
          <div className="flex flex-wrap gap-2">
            <select aria-label={t('tresorerie.liste.filtreStatut')} className={SELECT_CLS} value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as StatutDepense | '')}>
              <option value="">{t('tresorerie.liste.tous')} — {t('tresorerie.liste.filtreStatut')}</option>
              {STATUTS.map((s) => <option key={s} value={s}>{t(`tresorerie.statuts.${s}`)}</option>)}
            </select>
            <select aria-label={t('tresorerie.liste.filtreCategorie')} className={SELECT_CLS} value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value as CategorieDepense | '')}>
              <option value="">{t('tresorerie.liste.toutes')} — {t('tresorerie.liste.filtreCategorie')}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
            <RowsSkeleton rows={4} />
          </div>
        ) : depenses.length === 0 ? (
          <p className="mt-4 text-sm text-faint">{t('tresorerie.liste.aucune')}</p>
        ) : (
          <div className="mt-4">
            <DataTable columns={colonnes} rows={depenses} rowKey={(d) => d.id} />
          </div>
        )}
      </Card>

      {(formOuvert || editDepense) && (
        <FormDepense
          depense={editDepense ?? undefined}
          onClose={() => {
            setFormOuvert(false)
            setEditDepense(null)
          }}
          onSauvegarde={async () => {
            setFormOuvert(false)
            setEditDepense(null)
            await recharger()
          }}
        />
      )}
      {rejet && <ModalRejet onClose={() => setRejet(null)} onConfirmer={confirmerRejet} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Formulaire de dépense — CRÉATION ou ÉDITION selon `depense`.
 * En édition, on met à jour les champs SANS toucher au statut (le back n'autorise l'édition
 * que sur BROUILLON/EN_ATTENTE ; les transitions de statut passent par les actions de ligne).
 */
function FormDepense({
  depense,
  onClose,
  onSauvegarde,
}: {
  depense?: Depense
  onClose: () => void
  onSauvegarde: () => void
}) {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()
  const edition = depense != null
  const [montant, setMontant] = useState(depense ? String(depense.montant) : '')
  const [date, setDate] = useState(depense ? depense.date.slice(0, 10) : '')
  const [description, setDescription] = useState(depense?.description ?? '')
  const [categorie, setCategorie] = useState<CategorieDepense>(depense?.categorie ?? 'AUTRE')
  const [enCours, setEnCours] = useState(false)

  const enregistrer = async (statut?: 'BROUILLON' | 'EN_ATTENTE') => {
    if (!accessToken) return
    const m = Number(montant)
    if (!Number.isInteger(m) || m < 1 || !date || description.trim() === '') return
    setEnCours(true)
    try {
      const champs = { montant: m, date, description: description.trim(), categorie }
      if (edition) {
        await depensesApi.update(depense.id, champs, accessToken)
        toast.success(t('tresorerie.toast.modifiee'))
      } else {
        await depensesApi.create({ ...champs, statut: statut ?? 'EN_ATTENTE' }, accessToken)
        toast.success(t('tresorerie.toast.creee'))
      }
      onSauvegarde()
    } catch (e) {
      toast.error(t('tresorerie.toast.erreur'), e instanceof ApiError ? e.message : messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={edition ? t('tresorerie.form.titreEdition') : t('tresorerie.form.titre')}>
      <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void enregistrer(edition ? undefined : 'EN_ATTENTE') }}>
        <Field label={t('tresorerie.form.montant')} required>
          <Input type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} />
        </Field>
        <Field label={t('tresorerie.form.date')} required>
          <DatePicker value={date} onChange={setDate} />
        </Field>
        <Field label={t('tresorerie.form.description')} required>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <Field label={t('tresorerie.form.categorie')}>
          <select className={SELECT_CLS + ' w-full'} value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieDepense)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`tresorerie.categories.${c}`)}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('tresorerie.form.annuler')}</Button>
          {edition ? (
            <Button type="submit" loading={enCours}>{t('tresorerie.form.enregistrer')}</Button>
          ) : (
            <>
              <Button type="button" variant="outline" loading={enCours} onClick={() => void enregistrer('BROUILLON')}>
                {t('tresorerie.form.enregistrerBrouillon')}
              </Button>
              <Button type="submit" loading={enCours}>{t('tresorerie.form.soumettre')}</Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  )
}

function ModalRejet({ onClose, onConfirmer }: { onClose: () => void; onConfirmer: (motif: string) => void }) {
  const { t } = useTranslation()
  const [motif, setMotif] = useState('')
  return (
    <Modal open onClose={onClose} title={t('tresorerie.form.motifRejet')}>
      <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); if (motif.trim()) onConfirmer(motif.trim()) }}>
        <Field label={t('tresorerie.form.motifRejet')} required>
          <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t('tresorerie.form.motifRejetPlaceholder')} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('tresorerie.form.annuler')}</Button>
          <Button type="submit" variant="danger" disabled={motif.trim() === ''}>{t('tresorerie.form.confirmerRejet')}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default TresoreriePage
