import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldUser,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { estMembreSimple, peutVoirBareme, peutGererUtilisateurs } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { NkoniMark } from '@/components/ui/NkoniMark'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrateur',
  PRESIDENT: 'Président',
  SECRETAIRE: 'Secrétaire',
  TRESORIERE: 'Trésorière',
  COMMISSAIRE_COMPTES: 'Commissaire aux comptes',
  MEMBRE_SIMPLE: 'Membre',
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

function useNavItems(): NavItem[] {
  const { user } = useAuth()
  const items: NavItem[] = [
    { to: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    {
      to: '/membres',
      label: estMembreSimple(user?.role) ? 'Ma fiche' : 'Membres',
      icon: Users,
    },
  ]
  if (peutVoirBareme(user?.role)) {
    items.push({ to: '/bareme', label: 'Barème annuel', icon: CalendarRange })
  }
  if (peutGererUtilisateurs(user?.role)) {
    items.push({ to: '/utilisateurs', label: 'Utilisateurs', icon: ShieldUser })
  }
  return items
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const items = useNavItems()
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-surface-2 text-foreground'
                  : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brass transition-all duration-150',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon
                  className={cn('h-[1.15rem] w-[1.15rem]', isActive ? 'text-brass' : '')}
                  aria-hidden="true"
                />
                {item.label}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function UserChip() {
  const { user } = useAuth()
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface/60 px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-brass">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{user?.email}</p>
        <p className="truncate text-xs text-faint">{ROLE_LABEL[user?.role ?? ''] ?? user?.role}</p>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-2 py-1">
        <NkoniMark className="h-9 w-9 text-lg" />
        <span className="font-display text-xl font-semibold tracking-tight text-foreground">
          NKONI
        </span>
      </Link>

      <div className="mt-7 flex-1">
        <p className="mb-2 px-3 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-faint">
          Navigation
        </p>
        <NavLinks onNavigate={onNavigate} />
      </div>

      <div className="mt-4 space-y-2">
        <UserChip />
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface/70 hover:text-terra disabled:opacity-60"
        >
          <LogOut className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
    </div>
  )
}

/**
 * Coquille d'application : nav latérale persistante (desktop) + drawer (mobile),
 * halo ambiant, conteneur de contenu centré. Enveloppe toutes les pages protégées.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()

  // Ferme le drawer à chaque changement de route.
  useEffect(() => setDrawer(false), [location.pathname])

  return (
    <div className="relative min-h-screen">
      <div className="nk-aura pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-hairline bg-canvas/80 p-4 backdrop-blur-xl lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Topbar mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-canvas/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <NkoniMark className="h-8 w-8 text-base" />
          <span className="font-display text-lg font-semibold tracking-tight">NKONI</span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline-strong bg-surface-2 text-foreground"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
            aria-label="Fermer le menu"
          />
          <div className="nk-toast-in absolute inset-y-0 left-0 w-[17rem] border-r border-hairline bg-canvas p-4">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      {/* Contenu */}
      <div className="lg:pl-64">
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </div>
    </div>
  )
}

export default AppShell
