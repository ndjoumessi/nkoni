import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Champs de formulaire NKONI — style unique partagé (fini le `inputCls` copié
 * dans chaque page). Input / Select / Textarea + wrapper Field (label + hint + erreur).
 */

const control =
  'w-full rounded-xl border border-hairline-strong bg-surface-2/70 px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors duration-150 placeholder:text-faint focus:border-brass/50 focus:bg-surface-2 focus:outline-none disabled:opacity-55'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      control,
      "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23b9b3a5%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M4 6l4 4 4-4%22/></svg>')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
      className,
    )}
    {...props}
  />
))
Select.displayName = 'Select'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'resize-y', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  error?: string
  required?: boolean
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1 text-[0.72rem] font-medium uppercase tracking-[0.1em] text-faint">
        {label}
        {required && <span className="text-brass">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-terra">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-faint">{hint}</span>
      )}
    </label>
  )
}

export default Field
