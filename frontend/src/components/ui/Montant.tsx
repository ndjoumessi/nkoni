import { formatteurMontant } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Affichage ÉCRAN d'un montant : chiffre proéminent (classe `.num`, IBM Plex Mono), unité de devise
 * discrète (plus petite, `text-faint`). Purement présentation.
 *
 * Formate via `Intl.NumberFormat.formatToParts()` en réutilisant `formatteurMontant()` — la MÊME
 * source d'options que `formatMontant` (locale, devise ISO, sans décimales). On n'appelle donc PAS
 * `formatMontant` (qui rend une chaîne indivisible, réservée aux exports/PDF/toasts) : on a besoin
 * de séparer la partie `currency` du reste pour l'atténuer.
 *
 * La partie devise (`part.type === 'currency'`) est rendue dans un `<span>` atténué ; tout le reste
 * (chiffres, séparateurs de milliers, éventuel espace de la locale) garde le poids plein. L'espace
 * `literal` qu'`Intl` insère entre chiffre et devise (ex. « 30 000 FCFA ») est absorbé : on force un
 * petit espace typographique constant devant l'unité, quel que soit son placement dans la locale.
 */
export function Montant({
  value,
  className,
  deviseClassName,
}: {
  value: number
  /** Classe sur le conteneur (taille/couleur du CHIFFRE). Le `.num` est déjà appliqué. */
  className?: string
  /** Classe optionnelle pour surcharger l'atténuation de l'unité. */
  deviseClassName?: string
}) {
  const parts = formatteurMontant().formatToParts(value)
  // Le symbole peut précéder (EN « $30,000 ») ou suivre (FR « 30 000 FCFA ») le nombre. On rend
  // chaque part telle quelle, en atténuant la seule part `currency` et en laissant tomber l'espace
  // `literal` adjacent (remplacé par une marge constante sur l'unité).
  const devisePrefixe = parts[0]?.type === 'currency'

  return (
    <span className={cn('num', className)}>
      {parts
        .filter((p) => p.type !== 'literal')
        .map((part, i) =>
          part.type === 'currency' ? (
            <span
              key={i}
              className={cn(
                'text-[0.72em] font-normal text-faint',
                devisePrefixe ? 'mr-0.5' : 'ml-0.5',
                deviseClassName,
              )}
            >
              {part.value}
            </span>
          ) : (
            part.value
          ),
        )}
    </span>
  )
}

export default Montant
