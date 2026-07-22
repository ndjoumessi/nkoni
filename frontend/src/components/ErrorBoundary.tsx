import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '@/components/ui/ErrorState'
import { signaler } from '@/lib/observabilite'

/**
 * Fallback plein écran affiché quand un rendu React lève. SÉPARÉ du boundary parce que celui-ci est
 * une CLASSE (les error boundaries n'existent qu'en composant classe) et ne peut donc pas appeler de
 * hook : ce composant fonctionnel porte `useTranslation`. Réutilise la primitive `ErrorState`
 * (« Menthe & Encre », tons terra, `role="alert"`) — on ne reduplique pas son style.
 */
function FallbackErreurFatale() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <ErrorState
        className="w-full max-w-md"
        title={t('commun.erreurFatale.titre')}
        description={t('commun.erreurFatale.description')}
        // Un crash de rendu laisse un état corrompu : un rechargement dur (et non une navigation
        // routeur, qui pourrait re-crasher) est la seule reprise sûre.
        onRetry={() => window.location.reload()}
        retryLabel={t('commun.erreurFatale.recharger')}
      />
    </div>
  )
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * ErrorBoundary applicatif (bloquant GA 0.1) — DERNIER filet contre l'écran blanc.
 *
 * Le filet `window.onerror` (main.tsx) ALERTE déjà via `signaler`, mais ne remplace pas l'écran :
 * une erreur de rendu React laissait l'utilisateur devant une page vide. Ce boundary capte le crash,
 * l'ALERTE aussi (même couche `observabilite`, inerte sans DSN, best-effort → ne relève jamais) et
 * AFFICHE un fallback lisible avec une action de rechargement, au lieu du vide.
 *
 * Monté au sommet de l'arbre (cf. main.tsx) pour couvrir routeur, providers et pages.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    signaler(error, { type: 'react.errorBoundary', composant: info.componentStack })
  }

  render(): ReactNode {
    if (this.state.hasError) return <FallbackErreurFatale />
    return this.props.children
  }
}

export default ErrorBoundary
