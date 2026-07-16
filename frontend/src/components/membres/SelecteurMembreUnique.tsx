import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Search, Users } from 'lucide-react'
import { cn, normaliserTexte } from '@/lib/utils'
import { usePopoverFlottant } from '@/components/ui/usePopoverFlottant'

/**
 * Sélecteur d'UN membre, CHERCHABLE — remplace un `<select>` natif ingérable à 30+ membres
 * (amendes, filtres). Réutilise la primitive `usePopoverFlottant` (portail + positionnement
 * `fixed` + clic-extérieur + Échap) et `normaliserTexte` (recherche insensible casse/accents,
 * sur prénom OU nom). La sélection est portée par le parent (`valeur`/`onChange`).
 *
 * `optionTous` (facultatif) ajoute une entrée « tous » en tête → usage FILTRE (valeur ''). Sans
 * elle, c'est un champ de formulaire (placeholder tant qu'aucun membre choisi).
 */

export interface MembreOption {
  id: string
  nom: string
  prenom: string
}

export function SelecteurMembreUnique({
  membres,
  valeur,
  onChange,
  placeholder,
  optionTous,
  ariaLabel,
  className,
}: {
  membres: MembreOption[]
  valeur: string
  onChange: (id: string) => void
  placeholder: string
  optionTous?: string
  ariaLabel?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [largeur, setLargeur] = useState<number | undefined>(undefined)
  const [surbrillance, setSurbrillance] = useState(0)
  const rechercheRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLUListElement>(null)
  const uid = useId()

  const { containerRef, triggerRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: () => setOpen(false),
    largeurDefaut: 280,
    hauteurDefaut: 320,
  })

  const selection = membres.find((m) => m.id === valeur) ?? null
  const label = selection ? `${selection.prenom} ${selection.nom}`.trim() : placeholder

  const filtres = useMemo(() => {
    const nq = normaliserTexte(q.trim())
    if (!nq) return membres
    return membres.filter((m) => normaliserTexte(`${m.prenom} ${m.nom}`).includes(nq))
  }, [membres, q])

  // Liste PLATE des options navigables (entrée « tous » optionnelle en tête + membres filtrés) —
  // sert d'index unique pour la surbrillance clavier et `aria-activedescendant`.
  const options = useMemo(() => {
    const base: { id: string; label: string }[] = []
    if (optionTous !== undefined) base.push({ id: '', label: optionTous })
    for (const m of filtres) base.push({ id: m.id, label: `${m.prenom} ${m.nom}`.trim() })
    return base
  }, [optionTous, filtres])

  const surIndex = options.length ? Math.max(0, Math.min(surbrillance, options.length - 1)) : 0

  // Remet la surbrillance en tête à l'ouverture et à chaque changement de recherche.
  useEffect(() => setSurbrillance(0), [q, open])

  // Fait défiler l'option surlignée dans la vue (navigation clavier sur une longue liste).
  useEffect(() => {
    if (!open) return
    listeRef.current?.querySelector<HTMLElement>(`[data-idx="${surIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [surIndex, open])

  // Le popover épouse la largeur du déclencheur (mesurée à l'ouverture).
  useLayoutEffect(() => {
    if (open) setLargeur(triggerRef.current?.offsetWidth)
  }, [open, triggerRef])

  // Focus le champ de recherche à l'ouverture ; réinitialise la requête à la fermeture.
  useEffect(() => {
    if (!open) {
      setQ('')
      return
    }
    const id = requestAnimationFrame(() => rechercheRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const choisir = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  const ligneClasses = (actif: boolean) =>
    cn(
      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
      actif ? 'bg-surface text-foreground' : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground',
    )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border border-hairline bg-surface/50 px-3 py-2.5 text-left text-sm transition-colors hover:border-hairline-strong',
          selection ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
      </button>

      {open &&
        rendreFlottant(
          <div
            style={{ width: largeur }}
            className="overflow-hidden rounded-xl border border-hairline-strong bg-surface-2 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              <input
                ref={rechercheRef}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={`${uid}-liste`}
                aria-autocomplete="list"
                aria-activedescendant={options.length ? `${uid}-opt-${surIndex}` : undefined}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    if (options.length) setSurbrillance((i) => (i + 1) % options.length)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    if (options.length) setSurbrillance((i) => (i - 1 + options.length) % options.length)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const opt = options[surIndex]
                    if (opt) choisir(opt.id)
                  }
                }}
                placeholder={t('ui.selecteurMembres.recherchePlaceholder')}
                aria-label={t('ui.selecteurMembres.rechercheAria')}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-faint focus:outline-none"
              />
            </div>
            <ul id={`${uid}-liste`} ref={listeRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {options.map((opt, index) => {
                const selectionnee = opt.id === valeur
                const surligne = index === surIndex
                return (
                  <li
                    key={opt.id || '__tous'}
                    id={`${uid}-opt-${index}`}
                    data-idx={index}
                    role="option"
                    aria-selected={selectionnee}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseMove={() => setSurbrillance(index)}
                      onClick={() => choisir(opt.id)}
                      className={ligneClasses(selectionnee || surligne)}
                    >
                      <span className="w-4 shrink-0">
                        {selectionnee && <Check className="h-4 w-4 text-brass" aria-hidden="true" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                )
              })}
              {filtres.length === 0 && (
                <li className="px-3 py-3 text-center text-sm text-faint">
                  {t('ui.selecteurMembres.aucunResultat')}
                </li>
              )}
            </ul>
          </div>,
          { className: 'z-50', 'aria-label': ariaLabel ?? placeholder },
        )}
    </div>
  )
}

export default SelecteurMembreUnique
