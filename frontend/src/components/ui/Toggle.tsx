import { cn } from '@/lib/utils'

/**
 * Interrupteur (switch) accessible — design system Laiton & Jade.
 * `role="switch"` + `aria-checked`, focus visible, jade à l'état activé.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 disabled:opacity-50',
        checked ? 'border-jade/50 bg-jade/85' : 'border-hairline-strong bg-surface-2',
      )}
    >
      <span
        className={cn(
          'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export default Toggle
