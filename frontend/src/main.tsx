import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { initI18n } from '@/lib/i18n' // §4 : charge le catalogue de la langue active…
import App from './App.tsx'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'

// PWA : enregistre le service worker (app shell précaché, lecture /api hors-ligne). autoUpdate →
// le SW se met à jour tout seul au déploiement suivant. Sans effet en dev / navigateur non compatible.
registerSW({ immediate: true })

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
