import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Champs de formulaire NKONI — style unique partagé (fini le `inputCls` copié
 * dans chaque page). Input / Select / Textarea + wrapper Field (label + hint + erreur).
 *
 * §8 (Forms) : le wrapper Field câble l'accessibilité — `htmlFor`/`id`, `aria-invalid`
 * et `aria-describedby` sont injectés automatiquement dans le contrôle enfant, et
 * l'état d'erreur teinte la bordure (aria-[invalid=true]).
 */

const control =
  'w-full rounded-xl border border-hairline-strong bg-surface-2/70 px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors duration-150 placeholder:text-faint focus:border-brass/50 focus:bg-surface-2 focus:outline-none disabled:opacity-55 aria-[invalid=true]:border-terra/70 aria-[invalid=true]:bg-terra/[0.05] aria-[invalid=true]:focus:border-terra'

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

type ControlProps = {
  id?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
}

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
  const autoId = useId()
  const descId = `${autoId}-desc`
  const description = error ?? hint

  // Injecte l'accessibilité §8 dans le contrôle : id (pour htmlFor), aria-invalid,
  // aria-describedby. Le contrôle enfant doit être l'élément direct (Input/Select/Textarea).
  let controlId = autoId
  let rendered: ReactNode = children
  if (isValidElement(children)) {
    const child = children as ReactElement<ControlProps>
    controlId = child.props.id ?? autoId
    rendered = cloneElement(child, {
      id: controlId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': description ? descId : undefined,
    })
  }

  return (
    <div className={cn('block', className)}>
      <label
        htmlFor={controlId}
        className="mb-1.5 flex items-center gap-1 text-[0.72rem] font-medium uppercase tracking-[0.1em] text-faint"
      >
        {label}
        {required && (
          <span className="text-brass" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {rendered}
      {error ? (
        <span id={descId} role="alert" className="mt-1.5 flex items-start gap-1 text-xs text-terra">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </span>
      ) : (
        hint && (
          <span id={descId} className="mt-1.5 block text-xs text-faint">
            {hint}
          </span>
        )
      )}
    </div>
  )
}

export default Field
