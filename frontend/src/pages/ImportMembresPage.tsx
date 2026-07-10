import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Upload, FileDown, CheckCircle2, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  ApiError,
  messageErreur,
  type LigneImport,
  type RapportImport,
  type ErreurImport,
  type ResultatImport,
} from '@/lib/api'
import { normaliserTexte } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type Column } from '@/components/ui/DataTable'

/** Champs Membre importables (ordre d'affichage) ; les 3 premiers sont obligatoires. */
const CHAMPS = [
  'nom',
  'prenom',
  'anneeAdhesion',
  'sexe',
  'dateNaissance',
  'telephone',
  'adresse',
  'fonctionSociale',
  'statut',
  'anneeFinContribution',
  'dateDeces',
  'branche',
] as const
type ChampImport = (typeof CHAMPS)[number]
const REQUIS: readonly ChampImport[] = ['nom', 'prenom', 'anneeAdhesion']

/** En-têtes du fichier modèle (= clés de champ → auto-mapping exact) + une ligne d'exemple. */
const MODELE_ENTETES = [...CHAMPS]
const MODELE_EXEMPLE = [
  'Tchoupa', 'Bernard', '2018', 'M', '1980-05-12', '690000000',
  'Douala', 'Chef de famille', 'ACTIF', '', '', 'Nord',
]

type Etape = 'fichier' | 'mapping' | 'apercu' | 'resultat'

interface LignePreview {
  ligne: number
  nom: string
  prenom: string
  annee: string
  etat: 'valide' | 'doublon' | 'erreur'
  messages: string[]
}

export function ImportMembresPage() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [etape, setEtape] = useState<Etape>('fichier')
  const [nomFichier, setNomFichier] = useState('')
  const [entetes, setEntetes] = useState<string[]>([])
  const [lignesBrutes, setLignesBrutes] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<ChampImport, number | null>>(
    () => Object.fromEntries(CHAMPS.map((c) => [c, null])) as Record<ChampImport, number | null>,
  )
  const [creerBranches, setCreerBranches] = useState(false)
  const [rapport, setRapport] = useState<RapportImport | null>(null)
  const [lignes, setLignes] = useState<LigneImport[]>([])
  const [resultat, setResultat] = useState<ResultatImport | null>(null)
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [commitEnCours, setCommitEnCours] = useState(false)

  const label = (c: ChampImport) => t(`import.champs.${c}`)

  /* --- Étape 1 : lecture du fichier ------------------------------------- */
  const choisirFichier = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const nomFeuille = wb.SheetNames[0]
      const ws = nomFeuille ? wb.Sheets[nomFeuille] : undefined
      if (!ws) throw new Error('feuille absente')
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' })
      const entetesLues = (aoa[0] ?? []).map((h) => String(h ?? '').trim())
      const rows = aoa
        .slice(1)
        .map((r) => r.map((c) => String(c ?? '').trim()))
        .filter((r) => r.some((c) => c !== ''))

      if (entetesLues.length === 0 || rows.length === 0) {
        toast.error(t('import.fichier.invalide'), t('import.fichier.aucuneLigne'))
        return
      }
      setNomFichier(file.name)
      setEntetes(entetesLues)
      setLignesBrutes(rows)
      setMapping(autoMapping(entetesLues))
      setEtape('mapping')
    } catch {
      toast.error(t('import.fichier.invalide'), t('import.fichier.invalideDetail'))
    }
  }

  /** Devine la colonne de chaque champ par nom d'en-tête (insensible casse/accents). */
  function autoMapping(entetesLues: string[]): Record<ChampImport, number | null> {
    const norm = entetesLues.map((h) => normaliserTexte(h))
    const res = {} as Record<ChampImport, number | null>
    for (const c of CHAMPS) {
      const cibles = [normaliserTexte(c), normaliserTexte(label(c))]
      const idx = norm.findIndex((h) => cibles.includes(h))
      res[c] = idx >= 0 ? idx : null
    }
    return res
  }

  /* --- Étape 2 : mapping → analyse (aperçu) ----------------------------- */
  const construireLignes = (): LigneImport[] =>
    lignesBrutes.map((r) => {
      const l: Record<string, string> = {}
      for (const c of CHAMPS) {
        const col = mapping[c]
        if (col == null) continue
        const val = r[col] ?? ''
        if (val.trim() !== '') l[c] = val.trim()
      }
      return l as LigneImport
    })

  const requisManquants = REQUIS.filter((c) => mapping[c] == null)

  const analyser = async () => {
    if (!accessToken || requisManquants.length > 0) return
    const lignesConstruites = construireLignes()
    setAnalyseEnCours(true)
    try {
      const rap = await membresApi.importerApercu(lignesConstruites, creerBranches, accessToken)
      setLignes(lignesConstruites)
      setRapport(rap)
      setEtape('apercu')
    } catch (e) {
      toast.error(t('import.toast.analyseErreurTitre'), messageErreur(e))
    } finally {
      setAnalyseEnCours(false)
    }
  }

  /* --- Étape 3 : aperçu → commit ---------------------------------------- */
  const preview: LignePreview[] = useMemo(() => {
    if (!rapport) return []
    const erreursParLigne = new Map<number, ErreurImport[]>()
    for (const e of rapport.erreurs) {
      const a = erreursParLigne.get(e.ligne) ?? []
      a.push(e)
      erreursParLigne.set(e.ligne, a)
    }
    const doublons = new Set(rapport.doublons.map((d) => d.ligne))
    return lignes.map((l, i) => {
      const ligne = i + 1
      const errs = erreursParLigne.get(ligne) ?? []
      const etatLigne: LignePreview['etat'] = errs.length > 0 ? 'erreur' : doublons.has(ligne) ? 'doublon' : 'valide'
      return {
        ligne,
        nom: String(l.nom ?? ''),
        prenom: String(l.prenom ?? ''),
        annee: String(l.anneeAdhesion ?? ''),
        etat: etatLigne,
        messages: errs.map((e) => e.message),
      }
    })
  }, [rapport, lignes])

  const peutConfirmer =
    rapport != null && rapport.erreurs.length === 0 && !rapport.quota.depasse && rapport.valides > 0

  const confirmer = async () => {
    if (!accessToken || !peutConfirmer) return
    setCommitEnCours(true)
    try {
      const res = await membresApi.importerCommit(lignes, creerBranches, accessToken)
      setResultat(res)
      setEtape('resultat')
      toast.success(t('import.toast.reussiTitre'), t('import.resultat.crees', { count: res.crees }))
    } catch (e) {
      toast.error(t('import.toast.erreurTitre'), e instanceof ApiError ? e.message : messageErreur(e))
    } finally {
      setCommitEnCours(false)
    }
  }

  const recommencer = () => {
    setEtape('fichier')
    setNomFichier('')
    setEntetes([])
    setLignesBrutes([])
    setRapport(null)
    setLignes([])
    setResultat(null)
  }

  /* --- Modèles ---------------------------------------------------------- */
  const telechargerCsv = () => {
    const csv = [MODELE_ENTETES, MODELE_EXEMPLE]
      .map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    declencherTelechargement(blob, 'modele-import-membres.csv')
  }
  const telechargerXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet([MODELE_ENTETES, MODELE_EXEMPLE])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Membres')
    XLSX.writeFile(wb, 'modele-import-membres.xlsx')
  }

  const previewColonnes: Column<LignePreview>[] = [
    { key: 'ligne', header: t('import.apercu.colonneLigne'), numeric: true, width: '4rem', cell: (r) => r.ligne },
    { key: 'nom', header: label('nom'), cell: (r) => r.nom || '—' },
    { key: 'prenom', header: label('prenom'), cell: (r) => r.prenom || '—' },
    { key: 'annee', header: label('anneeAdhesion'), numeric: true, cell: (r) => r.annee || '—' },
    {
      key: 'etat',
      header: t('import.apercu.colonneStatut'),
      cell: (r) =>
        r.etat === 'erreur' ? (
          <Badge tone="terra" size="sm">{t('import.apercu.statutErreur')}</Badge>
        ) : r.etat === 'doublon' ? (
          <Badge tone="amber" size="sm">{t('import.apercu.statutDoublon')}</Badge>
        ) : (
          <Badge tone="jade" size="sm">{t('import.apercu.statutValide')}</Badge>
        ),
    },
    {
      key: 'detail',
      header: '',
      cell: (r) => (r.messages.length > 0 ? <span className="text-xs text-terra">{r.messages.join(' · ')}</span> : ''),
    },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ to: '/membres', label: t('import.retour') }}
        title={t('import.titre')}
        description={t('import.sousTitre')}
      />

      {/* Fil d'étapes */}
      <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
        {(['fichier', 'mapping', 'apercu', 'resultat'] as Etape[]).map((e, i) => (
          <li key={e} className="flex items-center gap-2">
            <span
              aria-current={etape === e ? 'step' : undefined}
              className={etape === e ? 'font-medium text-brass' : ''}
            >
              {i + 1}. {t(`import.etapes.${e}`)}
            </span>
            {i < 3 && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {/* Étape 1 — Fichier */}
      {etape === 'fichier' && (
        <Card className="mt-4 p-6">
          <Overline>{t('import.etapes.fichier')}</Overline>
          <p className="mt-3 text-sm text-muted-foreground">{t('import.fichier.consigne')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(ev) => {
              const f = ev.target.files?.[0]
              ev.target.value = ''
              if (f) void choisirFichier(f)
            }}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" icon={Upload} onClick={() => fileRef.current?.click()}>
              {t('import.fichier.choisir')}
            </Button>
            <Button type="button" variant="outline" icon={FileDown} onClick={telechargerCsv}>
              {t('import.fichier.modeleCsv')}
            </Button>
            <Button type="button" variant="outline" icon={FileDown} onClick={telechargerXlsx}>
              {t('import.fichier.modeleXlsx')}
            </Button>
          </div>
        </Card>
      )}

      {/* Étape 2 — Mapping */}
      {etape === 'mapping' && (
        <Card className="mt-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <Overline>{t('import.mapping.titre')}</Overline>
            <span className="text-xs text-faint">
              {nomFichier} · {t('import.fichier.lignesDetectees', { count: lignesBrutes.length })}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t('import.mapping.requis')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CHAMPS.map((c) => (
              <label key={c} className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">
                  {label(c)} {REQUIS.includes(c) && <span className="text-terra">*</span>}
                </span>
                <select
                  value={mapping[c] ?? ''}
                  onChange={(ev) =>
                    setMapping((m) => ({ ...m, [c]: ev.target.value === '' ? null : Number(ev.target.value) }))
                  }
                  className="rounded-lg border border-hairline-strong bg-surface-2 px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
                >
                  <option value="">{t('import.mapping.ignorer')}</option>
                  {entetes.map((h, i) => (
                    <option key={i} value={i}>{h || `#${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={creerBranches}
              onChange={(ev) => setCreerBranches(ev.target.checked)}
              className="h-4 w-4 rounded border-hairline-strong bg-surface-2 accent-brass"
            />
            {t('import.mapping.creerBranches')}
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={recommencer}>
              {t('import.retour')}
            </Button>
            <Button
              type="button"
              icon={ArrowRight}
              loading={analyseEnCours}
              disabled={requisManquants.length > 0}
              onClick={analyser}
            >
              {t('import.mapping.analyser')}
            </Button>
          </div>
        </Card>
      )}

      {/* Étape 3 — Aperçu */}
      {etape === 'apercu' && rapport && (
        <Card className="mt-4 p-6">
          <Overline>{t('import.apercu.titre')}</Overline>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="jade">{t('import.apercu.valides', { count: rapport.valides })}</Badge>
            {rapport.doublons.length > 0 && (
              <Badge tone="amber">{t('import.apercu.doublons', { count: rapport.doublons.length })}</Badge>
            )}
            {rapport.erreurs.length > 0 && (
              <Badge tone="terra">{t('import.apercu.erreurs', { count: rapport.erreurs.length })}</Badge>
            )}
          </div>
          <p className={`mt-3 text-sm ${rapport.quota.depasse ? 'text-terra' : 'text-muted-foreground'}`}>
            {rapport.quota.depasse
              ? t('import.apercu.quotaDepasse', rapport.quota)
              : t('import.apercu.quotaOk', rapport.quota)}
          </p>
          {rapport.erreurs.length > 0 && (
            <p className="mt-1 text-sm text-terra">{t('import.apercu.corrigez')}</p>
          )}

          <div className="mt-4">
            <DataTable columns={previewColonnes} rows={preview} rowKey={(r) => String(r.ligne)} />
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={recommencer}>
              {t('import.apercu.recommencer')}
            </Button>
            <Button
              type="button"
              icon={CheckCircle2}
              loading={commitEnCours}
              disabled={!peutConfirmer}
              onClick={confirmer}
            >
              {t('import.apercu.confirmer')}
            </Button>
          </div>
        </Card>
      )}

      {/* Étape 4 — Résultat */}
      {etape === 'resultat' && resultat && (
        <Card className="mt-4 p-6">
          <EmptyState
            icon={CheckCircle2}
            title={t('import.resultat.titre')}
            description={`${t('import.resultat.crees', { count: resultat.crees })} · ${t('import.resultat.ignores', { count: resultat.ignores })}`}
            action={
              <div className="flex gap-2">
                <Link to="/membres">
                  <Button type="button">{t('import.resultat.voirMembres')}</Button>
                </Link>
                <Button type="button" variant="outline" icon={Upload} onClick={recommencer}>
                  {t('import.resultat.nouvelImport')}
                </Button>
              </div>
            }
          />
        </Card>
      )}
    </div>
  )
}

function declencherTelechargement(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default ImportMembresPage
