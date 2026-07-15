import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Sélecteur des éléments focusables au clavier À L'INTÉRIEUR du panneau — utilisé par le
 * piège de focus (§1/§8). Le `[tabindex="-1"]` du panneau lui-même est volontairement exclu.
 */
const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modale légère centrée — direction « Laiton & Jade » : overlay flouté + Card.
 * Ferme sur Escape et sur clic backdrop. Verrouille le scroll du body à l'ouverture.
 *
 * Accessibilité (§1/§8) — piège de focus complet :
 * - à l'OUVERTURE : l'élément déclencheur (`document.activeElement`) est mémorisé, puis le
 *   focus est déplacé sur le panneau (rendu focusable via `tabIndex={-1}`) ;
 * - PENDANT : Tab / Shift+Tab bouclent à l'intérieur du panneau (dernier → premier et
 *   inversement) ; Échap et le clic backdrop restent inchangés ;
 * - à la FERMETURE : le focus est restauré sur le déclencheur mémorisé s'il existe encore.
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
  const { t } = useTranslation()
  const panneauRef = useRef<HTMLDivElement>(null)
  const declencheurRef = useRef<HTMLElement | null>(null)

  // Focus : entrée dans la modale à l'ouverture, restauration au déclencheur à la fermeture.
  // Dépendance [open] UNIQUEMENT : un `onClose` recréé à chaque render ne doit pas re-mémoriser
  // un activeElement devenu interne à la modale.
  useEffect(() => {
    if (!open) return
    declencheurRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panneauRef.current?.focus()
    return () => {
      const declencheur = declencheurRef.current
      if (declencheur && declencheur.isConnected) declencheur.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Piège de focus : Tab / Shift+Tab bouclent dans le panneau (§8 focus-management).
      if (e.key !== 'Tab') return
      const panneau = panneauRef.current
      if (!panneau) return
      const focusables = Array.from(panneau.querySelectorAll<HTMLElement>(FOCUSABLES))
      if (focusables.length === 0) {
        e.preventDefault()
        panneau.focus()
        return
      }
      const premier = focusables[0]
      const dernier = focusables[focusables.length - 1]
      const actif = document.activeElement
      const dansPanneau = actif instanceof HTMLElement && panneau.contains(actif)
      if (e.shiftKey) {
        // Shift+Tab depuis le premier focusable (ou depuis le panneau lui-même) → dernier.
        if (!dansPanneau || actif === premier || actif === panneau) {
          e.preventDefault()
          dernier.focus()
        }
      } else if (!dansPanneau || actif === dernier) {
        // Tab depuis le dernier focusable → premier.
        e.preventDefault()
        premier.focus()
      }
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

  // Rendu en PORTAIL dans <body> : un ancêtre animé `nk-reveal` laisse un `transform` résiduel
  // qui deviendrait le containing block des `position: fixed` → la modale se positionnerait par
  // rapport à lui et serait écrêtée (même piège que les popovers, cf. CLAUDE.md). Le portail
  // l'immunise structurellement.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={t('ui.modal.fermer')}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panneauRef}
        tabIndex={-1}
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
            aria-label={t('ui.modal.fermer')}
            className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
