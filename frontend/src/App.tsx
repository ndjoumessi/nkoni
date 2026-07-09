import { lazy, Suspense } from 'react'
import { Routes, Route, Outlet } from 'react-router-dom'
// Pages du PREMIER RENDU / publiques → import STATIQUE (elles doivent s'afficher sans aller-retour
// réseau : landing, connexion, inscription sont la porte d'entrée avant toute session).
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import InscriptionPage from '@/pages/InscriptionPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { SuperAdminRoute } from '@/components/SuperAdminRoute'
import { AppShell } from '@/components/AppShell'
import { RouteFallback } from '@/components/RouteFallback'

/**
 * CODE-SPLITTING PAR ROUTE — la console plateforme et toutes les pages tenant sont chargées en
 * `lazy()` : chacune part dans son propre chunk, sorti du bundle initial (seules les pages
 * publiques ci-dessus y restent). Le `Suspense` de chaque zone affiche `RouteFallback` le temps
 * du chargement du chunk. Toutes les pages exportent un défaut → `import('@/pages/X')` direct.
 */
const SuperAdminPage = lazy(() => import('@/pages/SuperAdminPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const MonEspacePage = lazy(() => import('@/pages/MonEspacePage'))
const MembresPage = lazy(() => import('@/pages/MembresPage'))
const ImportMembresPage = lazy(() => import('@/pages/ImportMembresPage'))
const MembreFormPage = lazy(() => import('@/pages/MembreFormPage'))
const MembreDetailPage = lazy(() => import('@/pages/MembreDetailPage'))
const VersementFormPage = lazy(() => import('@/pages/VersementFormPage'))
const EquilibrageFormPage = lazy(() => import('@/pages/EquilibrageFormPage'))
const BaremePage = lazy(() => import('@/pages/BaremePage'))
const RapportsPage = lazy(() => import('@/pages/RapportsPage'))
const TresoreriePage = lazy(() => import('@/pages/TresoreriePage'))
const UtilisateursPage = lazy(() => import('@/pages/UtilisateursPage'))
const MonProfilPage = lazy(() => import('@/pages/MonProfilPage'))
const ParametresPage = lazy(() => import('@/pages/ParametresPage'))
const ReunionsPage = lazy(() => import('@/pages/ReunionsPage'))
const ReunionFormPage = lazy(() => import('@/pages/ReunionFormPage'))
const ReunionDetailPage = lazy(() => import('@/pages/ReunionDetailPage'))
const FonctionsPage = lazy(() => import('@/pages/FonctionsPage'))
const FonctionDetailPage = lazy(() => import('@/pages/FonctionDetailPage'))
const ConflitsPage = lazy(() => import('@/pages/ConflitsPage'))
const ConflitFormPage = lazy(() => import('@/pages/ConflitFormPage'))
const ConflitDetailPage = lazy(() => import('@/pages/ConflitDetailPage'))
const CommemorationsPage = lazy(() => import('@/pages/CommemorationsPage'))
const CommemorationFormPage = lazy(() => import('@/pages/CommemorationFormPage'))
const CommemorationDetailPage = lazy(() => import('@/pages/CommemorationDetailPage'))
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'))

/** Layout des pages authentifiées : garde d'accès + coquille d'application. Le `Suspense` entoure
 *  l'`Outlet` → l'`AppShell` (nav) reste affichée pendant le chargement du chunk de page. */
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/inscription" element={<InscriptionPage />} />

      {/* Console PLATEFORME (SaaS §2.3) — SUPER_ADMIN uniquement, layout autonome (hors AppShell). */}
      <Route
        path="/super-admin"
        element={
          <SuperAdminRoute>
            <Suspense fallback={<RouteFallback pleinEcran />}>
              <SuperAdminPage />
            </Suspense>
          </SuperAdminRoute>
        }
      />

      {/* Pages authentifiées, dans la coquille NKONI. Routes statiques avant /membres/:id. */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/mon-espace" element={<MonEspacePage />} />
        <Route path="/bareme" element={<BaremePage />} />
        <Route path="/rapports" element={<RapportsPage />} />
        <Route path="/tresorerie" element={<TresoreriePage />} />
        <Route path="/utilisateurs" element={<UtilisateursPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/mon-profil" element={<MonProfilPage />} />
        <Route path="/parametres" element={<ParametresPage />} />
        <Route path="/reunions" element={<ReunionsPage />} />
        <Route path="/reunions/nouvelle" element={<ReunionFormPage />} />
        <Route path="/reunions/:id" element={<ReunionDetailPage />} />
        <Route path="/fonctions" element={<FonctionsPage />} />
        <Route path="/fonctions/:id" element={<FonctionDetailPage />} />
        <Route path="/conflits" element={<ConflitsPage />} />
        <Route path="/conflits/nouveau" element={<ConflitFormPage />} />
        <Route path="/conflits/:id" element={<ConflitDetailPage />} />
        <Route path="/commemorations" element={<CommemorationsPage />} />
        <Route path="/commemorations/nouvelle" element={<CommemorationFormPage />} />
        <Route path="/commemorations/:id/editer" element={<CommemorationFormPage />} />
        <Route path="/commemorations/:id" element={<CommemorationDetailPage />} />
        <Route path="/membres" element={<MembresPage />} />
        <Route path="/membres/import" element={<ImportMembresPage />} />
        <Route path="/membres/nouveau" element={<MembreFormPage />} />
        <Route path="/membres/:id/editer" element={<MembreFormPage />} />
        <Route path="/membres/:id/versements/nouveau" element={<VersementFormPage />} />
        <Route path="/membres/:id/equilibrage" element={<EquilibrageFormPage />} />
        <Route path="/membres/:id" element={<MembreDetailPage />} />
      </Route>
    </Routes>
  )
}

export default App
