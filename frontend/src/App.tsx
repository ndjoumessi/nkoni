import { Routes, Route } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import MembresPage from '@/pages/MembresPage'
import MembreFormPage from '@/pages/MembreFormPage'
import MembreDetailPage from '@/pages/MembreDetailPage'
import VersementFormPage from '@/pages/VersementFormPage'
import BaremePage from '@/pages/BaremePage'
import { ProtectedRoute } from '@/components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      {/* Routes statiques avant la route paramétrée /membres/:id */}
      <Route
        path="/bareme"
        element={
          <ProtectedRoute>
            <BaremePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/membres"
        element={
          <ProtectedRoute>
            <MembresPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/membres/nouveau"
        element={
          <ProtectedRoute>
            <MembreFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/membres/:id/editer"
        element={
          <ProtectedRoute>
            <MembreFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/membres/:id/versements/nouveau"
        element={
          <ProtectedRoute>
            <VersementFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/membres/:id"
        element={
          <ProtectedRoute>
            <MembreDetailPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
