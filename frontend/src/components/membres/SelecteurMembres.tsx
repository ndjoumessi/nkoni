import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { cn, normaliserTexte } from '@/lib/utils'
import { Input } from '@/components/ui/Field'

/**
 * Liste de membres à COCHER, partagée par les formulaires Conflit (« Membres concernés ») et
 * Commémoration (« Membres honorés / concernés ») — auparavant dupliquée inline dans chaque page.
 *
 * Ajouts (recherche vécue pénible à 36+ membres) :
 *  - champ de recherche (loupe) filtrant en TEMPS RÉEL sur nom OU prénom, insensible casse/accents
 *    (`normaliserTexte`) ;
 *  - compteur « X sélectionné(s) » toujours visible (au-dessus de la liste, pas besoin de scroller) ;
 *  - la SÉLECTION est portée par le parent (`selection`/`onToggle`) : filtrer la vue ne la perd
 *    jamais — un membre coché reste coché même s'il sort du résultat de recherche ;
 *  - message clair « Aucun membre trouvé » quand la recherche ne renvoie rien.
 *
 * Le parent garde l'en-tête de section (titre/aide) et le cas « aucun membre dans l'org » (il ne
 * monte ce composant que si `membres` est non vide).
 */

export interface MembreCochable {
  id: string
  nom: string
  prenom: string
}

export function SelecteurMembres({
  membres,
  selection,
  onToggle,
  className,
}: {
  membres: MembreCochable[]
  selection: Set<string>
  onToggle: (id: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const [recherche, setRecherche] = useState('')

  const filtres = useMemo(() => {
    const q = normaliserTexte(recherche.trim())
    if (!q) return membres
    return membres.filter((m) => normaliserTexte(`${m.nom} ${m.prenom}`).includes(q))
  }, [membres, recherche])

  return (
    <div className={cn('mt-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t('ui.selecteurMembres.recherchePlaceholder')}
            aria-label={t('ui.selecteurMembres.rechercheAria')}
            className="pl-10"
          />
        </div>
        {/* Compteur toujours visible (aria-live : annonce le nombre au fil des cases cochées). */}
        <p className="text-xs text-faint" aria-live="polite">
          {t('ui.selecteurMembres.selectionnes', { count: selection.size })}
        </p>
      </div>

      {filtres.length === 0 ? (
        <p className="mt-3 rounded-xl border border-hairline bg-surface-2/40 px-3 py-6 text-center text-sm text-muted-foreground">
          {t('ui.selecteurMembres.aucunResultat')}
        </p>
      ) : (
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-hairline bg-surface-2/40 p-2">
          {filtres.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={selection.has(m.id)}
                onChange={() => onToggle(m.id)}
                className="h-4 w-4 rounded border-hairline-strong accent-brass"
              />
              <span className="text-foreground">
                {m.prenom} {m.nom}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default SelecteurMembres
