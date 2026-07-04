import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

/**
 * Placeholder du tableau de bord (route protégée).
 */
export function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0b12] px-6 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/12 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
        <p className="text-sm uppercase tracking-wider text-white/40">Tableau de bord</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Bienvenue{' '}
          <span className="bg-gradient-to-r from-indigo-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
            {user?.email}
          </span>
        </h1>
        {user?.role && (
          <p className="mt-2 text-sm text-white/50">
            Rôle : <span className="font-medium text-white/70">{user.role}</span>
          </p>
        )}

        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
    </main>
  )
}

export default DashboardPage
