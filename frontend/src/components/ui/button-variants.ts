import { cva } from 'class-variance-authority'

/**
 * Variantes de style du bouton NKONI (partagées). Extraites du composant `Button` pour
 * pouvoir styliser d'autres éléments (ex. `<a href="mailto:…">`) avec la même apparence,
 * sans casser le fast-refresh (un fichier de composant ne doit exporter que des composants).
 *
 * `brass` = action primaire (rare) — dégradé DIAGONAL émeraude profond → or (`--emerald-deep`
 * → `--amber`) pour un rendu premium ; `outline`/`ghost` = secondaire, `danger` = destructif.
 */
export const buttonVariants = cva(
  // ⚠️ ANNEAU DE FOCUS EXPLICITE — ne pas retirer au motif qu'`index.css` en pose un globalement.
  // L'anneau global (`:focus-visible { box-shadow: … }`) vit dans la couche CSS `base` ; le variant
  // `brass` (le DÉFAUT, donc le CTA primaire) applique un `shadow-[…]` qui vit dans la couche
  // `utilities`. En cascade de couches, `utilities` GAGNE sur `base` quelle que soit la spécificité
  // → le box-shadow décoratif ÉCRASAIT l'anneau, et `focus-visible:outline-none` supprimait en plus
  // le repli natif : le bouton le plus important de l'app n'avait AUCUN focus visible au clavier.
  // ⚠️ `ring-*` n'est PAS une propriété distincte de `box-shadow` : Tailwind injecte l'anneau dans
  // `--tw-ring-shadow` et l'ombre dans `--tw-shadow`, puis concatène les deux dans un SEUL
  // `box-shadow` — c'est ce qui les fait coexister ici. Corollaire à ne pas perdre de vue : un
  // `box-shadow` BRUT (style inline, CSS hors Tailwind, composant tiers) écraserait l'anneau et
  // reproduirait exactement le défaut corrigé ci-dessus.
  // `active:scale-[0.98]` : retour tactile UNIFORME. Au doigt, `hover:` ne se déclenche pas, et
  // `-webkit-tap-highlight-color: transparent` (index.css) supprime le halo natif d'Android —
  // sans état `active:`, un appui ne produisait donc AUCUN retour visuel. Neutralisé de fait sous
  // `prefers-reduced-motion` (les durées y sont ramenées à 0.01ms).
  'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        brass:
          'bg-gradient-to-br from-emerald-deep to-amber text-brass-foreground shadow-[0_1px_0_oklch(1_0_0/25%)_inset,0_10px_24px_-10px_color-mix(in_oklch,var(--emerald-deep)_55%,transparent)] hover:brightness-[1.08] active:brightness-95',
        outline:
          'border border-hairline-strong bg-surface-2/60 text-foreground hover:border-brass/40 hover:bg-surface-3 active:bg-surface-3',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground active:bg-surface-2',
        // `text-terra-text` et non `text-terra` : même raison que le Badge — texte terra posé sur un
        // fond terra de MÊME teinte, qui remonte la luminance du substrat (3.96:1, sous AA).
        danger:
          'border border-terra/30 bg-terra/10 text-terra-text hover:bg-terra/15 active:bg-terra/20',
        jade: 'border border-jade/30 bg-jade/10 text-jade hover:bg-jade/15 active:bg-jade/20',
      },
      // Hauteurs MOBILE-FIRST : 44 px au doigt (seuil tactile), resserrées à partir de `sm:`
      // (≥ 640 px, donc souris/curseur précis) pour garder la densité des écrans de gestion.
      // `md` est le défaut : c'est lui qui portait l'essentiel des boutons, à 40 px.
      size: {
        sm: 'h-10 px-3.5 text-xs sm:h-9',
        md: 'h-11 px-5 text-sm sm:h-10',
        lg: 'h-12 px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'brass', size: 'md' },
  },
)
