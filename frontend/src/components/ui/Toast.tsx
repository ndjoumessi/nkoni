import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Système de toasts NKONI — pattern de feedback unique pour toutes les mutations async
 * (barème créé, versement enregistré, reçu généré, erreurs réseau…). Empilés en haut à
 * droite, auto-fermeture, respect de prefers-reduced-motion via nk-toast-in.
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
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (tone: Tone, title: string, description?: string) => {
      const id = ++counter.current
      setItems((prev) => [...prev, { id, tone, title, description }])
      window.setTimeout(() => remove(id), 5000)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2.5"
        role="region"
        aria-label="Notifications"
      >
        {items.map((t) => {
          const { icon: Icon, accent, ring } = CONFIG[t.tone]
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'nk-toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border border-hairline-strong bg-surface-2/95 p-3.5 shadow-[0_24px_60px_-24px_oklch(0_0_0/80%)] ring-1 ring-inset backdrop-blur-xl',
                ring,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', accent)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="rounded-md p-0.5 text-faint transition-colors hover:text-foreground"
                aria-label="Fermer la notification"
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
