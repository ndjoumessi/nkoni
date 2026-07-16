import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  CornerDownLeft,
  Flame,
  Gavel,
  Landmark,
  Search,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  membresApi,
  reunionsApi,
  conflitsApi,
  fonctionsApi,
  commemorationsApi,
} from '@/lib/api'
import {
  estMembreSimple,
  peutVoirReunions,
  peutVoirConflits,
  peutVoirFonctions,
  peutVoirCommemorations,
} from '@/lib/roles'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface Item {
  id: string
  /** Clé de type (résolue en libellé traduit à l'affichage). */
  typeKey: 'membre' | 'reunion' | 'conflit' | 'fonction' | 'commemoration'
  label: string
  sub?: string
  to: string
  icon: LucideIcon
}

/**
 * Recherche transverse (⌘K / Ctrl+K) — enrichissement UX validé. Agrège CÔTÉ CLIENT les
 * entités déjà exposées par l'API (membres, réunions, conflits, fonctions, commémorations),
 * selon les droits du rôle, pour un saut instantané vers une fiche. Aucun backend nouveau.
 */
export function CommandPalette() {
  const { user, accessToken } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [chargement, setChargement] = useState(false)
  const [actif, setActif] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panneauRef = useRef<HTMLDivElement>(null)
  // Piège de focus + verrou de scroll tant que la palette est ouverte (a11y §8).
  useFocusTrap(panneauRef, open)

  // Raccourci global ⌘K / Ctrl+K (toggle) + Escape (ferme).
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const ouvrir = () => setOpen(true)
    window.addEventListener('keydown', handler)
    window.addEventListener('nkoni:open-search', ouvrir)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('nkoni:open-search', ouvrir)
    }
  }, [])

  // Chargement paresseux à la 1re ouverture (selon les droits ; échecs 403 → ignorés).
  useEffect(() => {
    if (!open || items || !accessToken) return
    const role = user?.role
    let vivant = true
    setChargement(true)
    void (async () => {
      const acc: Item[] = []
      const jobs: Promise<unknown>[] = []
      if (!estMembreSimple(role)) {
        jobs.push(
          membresApi
            .listStatuts(accessToken)
            .then((l) =>
              l.forEach((m) =>
                acc.push({
                  id: `mem-${m.id}`,
                  typeKey: 'membre',
                  label: `${m.prenom} ${m.nom}`,
                  sub: m.branche?.nom ?? undefined,
                  to: `/membres/${m.id}`,
                  icon: Users,
                }),
              ),
            )
            .catch(() => {}),
        )
      }
      if (peutVoirReunions(role)) {
        jobs.push(
          reunionsApi
            .list(accessToken)
            .then((l) =>
              l.forEach((r) =>
                acc.push({
                  id: `reu-${r.id}`,
                  typeKey: 'reunion',
                  label: `${r.lieu}`,
                  sub: formatDate(r.date),
                  to: `/reunions/${r.id}`,
                  icon: Gavel,
                }),
              ),
            )
            .catch(() => {}),
        )
      }
      if (peutVoirConflits(role)) {
        jobs.push(
          conflitsApi
            .list(accessToken)
            .then((l) =>
              l.forEach((c) =>
                acc.push({
                  id: `con-${c.id}`,
                  typeKey: 'conflit',
                  label: c.titre,
                  sub: c.statut,
                  to: `/conflits/${c.id}`,
                  icon: ShieldAlert,
                }),
              ),
            )
            .catch(() => {}),
        )
      }
      if (peutVoirFonctions(role)) {
        jobs.push(
          fonctionsApi
            .list(accessToken)
            .then((l) =>
              l.forEach((f) =>
                acc.push({
                  id: `fon-${f.id}`,
                  typeKey: 'fonction',
                  label: f.nom,
                  sub: f.affectations[0]?.membre
                    ? `${f.affectations[0].membre.prenom} ${f.affectations[0].membre.nom}`
                    : t('shell.recherche.vacante'),
                  to: `/fonctions/${f.id}`,
                  icon: Landmark,
                }),
              ),
            )
            .catch(() => {}),
        )
      }
      if (peutVoirCommemorations(role)) {
        jobs.push(
          commemorationsApi
            .list(accessToken)
            .then((l) =>
              l.forEach((c) =>
                acc.push({
                  id: `com-${c.id}`,
                  typeKey: 'commemoration',
                  label: c.titre,
                  sub: formatDate(c.date),
                  to: `/commemorations/${c.id}`,
                  icon: Flame,
                }),
              ),
            )
            .catch(() => {}),
        )
      }
      await Promise.all(jobs)
      if (vivant) {
        setItems(acc)
        setChargement(false)
      }
    })()
    return () => {
      vivant = false
    }
  }, [open, items, accessToken, user?.role, t])

  // Focus + reset à l'ouverture.
  useEffect(() => {
    if (open) {
      setQ('')
      setActif(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const resultats = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = items ?? []
    const filtres = query
      ? base.filter((it) =>
          `${it.label} ${it.sub ?? ''} ${t(`shell.recherche.types.${it.typeKey}`)}`
            .toLowerCase()
            .includes(query),
        )
      : base
    return filtres.slice(0, 40)
  }, [items, q, t])

  useEffect(() => setActif(0), [q])

  // Invalide le cache à la FERMETURE : les données (membres, etc.) sont re-chargées à la
  // prochaine ouverture → un membre créé pendant la session apparaît (audit UI). Coût négligeable.
  useEffect(() => {
    if (!open) setItems(null)
  }, [open])

  const choisir = (it: Item | undefined) => {
    if (!it) return
    setOpen(false)
    navigate(it.to)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActif((a) => Math.min(a + 1, resultats.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choisir(resultats[actif])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('shell.recherche.ariaDialog')}
    >
      <button
        type="button"
        aria-label={t('shell.recherche.ariaFermer')}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div ref={panneauRef} className="nk-toast-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-hairline-strong bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls="cmdk-liste"
            aria-autocomplete="list"
            aria-activedescendant={resultats[actif] ? `cmdk-opt-${actif}` : undefined}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('shell.recherche.placeholder')}
            className="w-full bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-faint"
            aria-label={t('shell.recherche.ariaTerme')}
          />
          <kbd className="hidden shrink-0 rounded border border-hairline-strong px-1.5 py-0.5 text-3xs text-faint sm:block">
            {t('shell.recherche.echap')}
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1">
          {chargement && !items && (
            <p className="px-4 py-6 text-center text-sm text-faint">
              {t('shell.recherche.chargement')}
            </p>
          )}
          {items && resultats.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-faint">
              {t('shell.recherche.aucunResultat')}
            </p>
          )}
          <ul id="cmdk-liste" role="listbox">
            {resultats.map((it, i) => {
              const Icon = it.icon
              return (
                <li key={it.id} id={`cmdk-opt-${i}`} role="option" aria-selected={i === actif}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActif(i)}
                    onClick={() => choisir(it)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      i === actif ? 'bg-surface-2' : 'hover:bg-surface-2/60',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{it.label}</span>
                      {it.sub && <span className="block truncate text-xs text-faint">{it.sub}</span>}
                    </span>
                    <span className="shrink-0 text-3xs uppercase tracking-wide text-faint">
                      {t(`shell.recherche.types.${it.typeKey}`)}
                    </span>
                    {i === actif && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
