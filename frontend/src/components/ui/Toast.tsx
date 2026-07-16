import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Système de toasts NKONI — pattern de feedback unique pour toutes les mutations async
 * (barème créé, versement enregistré, reçu généré, erreurs réseau…). Empilés en haut à
 * droite, auto-fermeture (8 s pour les erreurs, 5 s sinon) mise en PAUSE au survol/focus,
 * respect de prefers-reduced-motion via nk-toast-in.
 */

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: Tone
  title: string
  description?: string
}

interface ToastApi {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const CONFIG: Record<Tone, { icon: typeof Info; accent: string; ring: string }> = {
  success: { icon: CheckCircle2, accent: 'text-jade', ring: 'ring-jade/25' },
  error: { icon: AlertTriangle, accent: 'text-terra', ring: 'ring-terra/30' },
  info: { icon: Info, accent: 'text-brass', ring: 'ring-brass/25' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  // Minuteurs d'auto-fermeture, PAUSABLES au survol/focus (a11y : laisser le temps de lire,
  // WCAG 2.2.1). Par toast : handle du timeout + temps restant recalculé à chaque pause.
  const minuteurs = useRef(new Map<number, { timeout: number; expire: number; restant: number }>())

  const remove = useCallback((id: number) => {
    const m = minuteurs.current.get(id)
    if (m) {
      window.clearTimeout(m.timeout)
      minuteurs.current.delete(id)
    }
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const pauser = useCallback((id: number) => {
    const m = minuteurs.current.get(id)
    if (!m) return
    window.clearTimeout(m.timeout)
    m.restant = Math.max(0, m.expire - Date.now())
  }, [])

  const reprendre = useCallback(
    (id: number) => {
      const m = minuteurs.current.get(id)
      if (!m) return
      window.clearTimeout(m.timeout)
      m.timeout = window.setTimeout(() => remove(id), m.restant)
      m.expire = Date.now() + m.restant
    },
    [remove],
  )

  const push = useCallback(
    (tone: Tone, title: string, description?: string) => {
      const id = ++counter.current
      setItems((prev) => [...prev, { id, tone, title, description }])
      const duree = tone === 'error' ? 8000 : 5000
      const timeout = window.setTimeout(() => remove(id), duree)
      minuteurs.current.set(id, { timeout, expire: Date.now() + duree, restant: duree })
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (titre, d) => push('success', titre, d),
      error: (titre, d) => push('error', titre, d),
      info: (titre, d) => push('info', titre, d),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2.5"
        role="region"
        aria-label={t('ui.toast.region')}
      >
        {items.map((item) => {
          const { icon: Icon, accent, ring } = CONFIG[item.tone]
          return (
            <div
              key={item.id}
              // Erreur → annonce assertive (role=alert) ; succès/info → polie (role=status).
              role={item.tone === 'error' ? 'alert' : 'status'}
              onMouseEnter={() => pauser(item.id)}
              onMouseLeave={() => reprendre(item.id)}
              onFocus={() => pauser(item.id)}
              onBlur={() => reprendre(item.id)}
              className={cn(
                'nk-toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border border-hairline-strong bg-surface-2/95 p-3.5 shadow-[0_24px_60px_-24px_oklch(0_0_0/80%)] ring-1 ring-inset backdrop-blur-xl',
                ring,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', accent)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="tap-target flex shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:text-foreground"
                aria-label={t('ui.toast.fermer')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}

export default ToastProvider
