import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClasses } from './control-styles'

/**
 * Champs de formulaire NKONI — style unique partagé (fini le `inputCls` copié
 * dans chaque page). Input / Select / Textarea + wrapper Field (label + hint + erreur).
 *
 * §8 (Forms) : le wrapper Field câble l'accessibilité — `htmlFor`/`id`, `aria-invalid`
 * et `aria-describedby` sont injectés automatiquement dans le contrôle enfant, et
 * l'état d'erreur teinte la bordure (aria-[invalid=true]).
 */

const control = controlClasses

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, className)} {...props} />
  ),
)
Input.displayName = 'Input'

// Chevron en <ChevronDown> positionné en absolu (pointer-events-none) plutôt qu'en
// background-image data-URI : la couleur suit le JETON `--faint` (un data-URI fige un hex
// et survit aux changements de thème — c'était la teinte de l'ancien thème « Laiton »).
// strokeWidth 2.25 en unités viewBox 24 ≙ le trait 1.5 de l'ancien SVG 16px (rendu identique).
export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(control, 'appearance-none pr-9', className)} {...props} />
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
      strokeWidth={2.25}
      aria-hidden="true"
    />
  </div>
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
  'aria-required'?: boolean
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
      'aria-required': required || undefined,
    })
  }

  return (
    <div className={cn('block', className)}>
      <label
        htmlFor={controlId}
        className="mb-1.5 flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.1em] text-faint"
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
