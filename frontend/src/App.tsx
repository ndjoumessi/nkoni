import { Routes, Route, Outlet } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import InscriptionPage from '@/pages/InscriptionPage'
import DashboardPage from '@/pages/DashboardPage'
import MembresPage from '@/pages/MembresPage'
import MembreFormPage from '@/pages/MembreFormPage'
import MembreDetailPage from '@/pages/MembreDetailPage'
import VersementFormPage from '@/pages/VersementFormPage'
import EquilibrageFormPage from '@/pages/EquilibrageFormPage'
import BaremePage from '@/pages/BaremePage'
import RapportsPage from '@/pages/RapportsPage'
import UtilisateursPage from '@/pages/UtilisateursPage'
import MonProfilPage from '@/pages/MonProfilPage'
import ParametresPage from '@/pages/ParametresPage'
import ReunionsPage from '@/pages/ReunionsPage'
import ReunionFormPage from '@/pages/ReunionFormPage'
import ReunionDetailPage from '@/pages/ReunionDetailPage'
import FonctionsPage from '@/pages/FonctionsPage'
import FonctionDetailPage from '@/pages/FonctionDetailPage'
import ConflitsPage from '@/pages/ConflitsPage'
import ConflitFormPage from '@/pages/ConflitFormPage'
import ConflitDetailPage from '@/pages/ConflitDetailPage'
import CommemorationsPage from '@/pages/CommemorationsPage'
import CommemorationFormPage from '@/pages/CommemorationFormPage'
import CommemorationDetailPage from '@/pages/CommemorationDetailPage'
import AuditLogPage from '@/pages/AuditLogPage'
import SuperAdminPage from '@/pages/SuperAdminPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { SuperAdminRoute } from '@/components/SuperAdminRoute'
import { AppShell } from '@/components/AppShell'

/** Layout des pages authentifiées : garde d'accès + coquille d'application. */
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Outlet />
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
            <SuperAdminPage />
          </SuperAdminRoute>
        }
      />

      {/* Pages authentifiées, dans la coquille NKONI. Routes statiques avant /membres/:id. */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bareme" element={<BaremePage />} />
        <Route path="/rapports" element={<RapportsPage />} />
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
