import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Modale légère centrée — direction « Laiton & Jade » : overlay flouté + Card.
 * Ferme sur Escape et sur clic backdrop. Verrouille le scroll du body à l'ouverture.
 *
 * Volontairement minimale (pas de piège de focus complet) : suffisant pour les petits
 * formulaires ponctuels de l'admin. À enrichir si un usage plus exigeant apparaît.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className={cn(
          'nk-toast-in relative w-full max-w-md rounded-2xl border border-hairline bg-canvas p-6 shadow-xl',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
