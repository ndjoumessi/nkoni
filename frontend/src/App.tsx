import { Routes, Route, Outlet } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import MembresPage from '@/pages/MembresPage'
import MembreFormPage from '@/pages/MembreFormPage'
import MembreDetailPage from '@/pages/MembreDetailPage'
import VersementFormPage from '@/pages/VersementFormPage'
import EquilibrageFormPage from '@/pages/EquilibrageFormPage'
import BaremePage from '@/pages/BaremePage'
import UtilisateursPage from '@/pages/UtilisateursPage'
import MonProfilPage from '@/pages/MonProfilPage'
import ReunionsPage from '@/pages/ReunionsPage'
import ReunionFormPage from '@/pages/ReunionFormPage'
import ReunionDetailPage from '@/pages/ReunionDetailPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
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

      {/* Pages authentifiées, dans la coquille NKONI. Routes statiques avant /membres/:id. */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bareme" element={<BaremePage />} />
        <Route path="/utilisateurs" element={<UtilisateursPage />} />
        <Route path="/mon-profil" element={<MonProfilPage />} />
        <Route path="/reunions" element={<ReunionsPage />} />
        <Route path="/reunions/nouvelle" element={<ReunionFormPage />} />
        <Route path="/reunions/:id" element={<ReunionDetailPage />} />
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
