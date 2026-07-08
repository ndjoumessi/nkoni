/**
 * Classe de style partagée des contrôles de formulaire (Input/Select/Textarea + déclencheur
 * DatePicker) — extraite ici pour rester réutilisable sans casser le fast-refresh des composants
 * (même motif que `button-variants.ts`). Direction « Laiton & Jade », état d'erreur inclus.
 */
export const controlClasses =
  'w-full rounded-xl border border-hairline-strong bg-surface-2/70 px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors duration-150 placeholder:text-faint focus:border-brass/50 focus:bg-surface-2 focus:outline-none disabled:opacity-55 aria-[invalid=true]:border-terra/70 aria-[invalid=true]:bg-terra/[0.05] aria-[invalid=true]:focus:border-terra'

/**
 * Boutons de navigation ‹ / › des en-têtes de popover (DatePicker, SelecteurAnnee) — partagé pour
 * ne pas diverger entre composants.
 */
export const navButtonClasses =
  'flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60'
