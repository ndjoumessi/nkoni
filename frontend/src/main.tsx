import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { initI18n } from '@/lib/i18n' // §4 : charge le catalogue de la langue active…
import App from './App.tsx'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { signaler } from '@/lib/observabilite'

// PWA : enregistre le service worker (app shell précaché, lecture /api hors-ligne). autoUpdate →
// le SW se met à jour tout seul au déploiement suivant. Sans effet en dev / navigateur non compatible.
registerSW({ immediate: true })

// OBSERVABILITÉ (bloquant GA 0.1) — filet global : une erreur non rattrapée (bug de rendu React
// remonté jusqu'à window, promesse rejetée sans `catch`) laisse aujourd'hui un écran blanc SANS
// que personne ne soit prévenu. `signaler` est inerte sans VITE_SENTRY_DSN et filtre déjà le bruit
// réseau attendu d'une PWA en mobilité (cf. lib/observabilite).
window.addEventListener('error', (e) => signaler(e.error ?? e.message, { type: 'window.error' }))
window.addEventListener('unhandledrejection', (e) =>
  signaler(e.reason, { type: 'unhandledrejection' }),
)

// …puis rend l'application (i18next initialisé AVANT le 1er rendu → aucun flash non traduit).
void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})
