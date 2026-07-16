import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Wallet,
  CalendarRange,
  Flame,
  HeartHandshake,
  Scale,
  Gavel,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldUser,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { CommandPalette } from '@/components/CommandPalette'
import { IndicateurSync } from '@/components/IndicateurSync'
import { moiApi } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import {
  estMembreSimple,
  peutVoirBareme,
  peutGererUtilisateurs,
  peutVoirReunions,
  peutVoirFonctions,
  peutVoirConflits,
  peutVoirCommemorations,
  peutVoirCagnottes,
  peutVoirAmendes,
  peutVoirRapports,
  peutVoirTresorerie,
  peutVoirAudit,
  peutVoirParametres,
} from '@/lib/roles'
import { cn, estMac } from '@/lib/utils'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

interface NavGroup {
  /** En-tête de section (absent pour le groupe de tête « Tableau de bord »). */
  label?: string
  items: NavItem[]
}

/**
 * Navigation groupée par domaine (§ UX) : Tableau de bord (seul, en tête), puis Communauté,
 * Finances et Administration. Chaque item reste gouverné par les permissions ; les groupes
 * VIDES (aucun item autorisé pour le rôle) sont retirés → pas d'en-tête orphelin.
 */
function useNavGroups(): NavGroup[] {
  const { user } = useAuth()
  const { t } = useTranslation()
  const role = user?.role

  // MEMBRE_SIMPLE : navigation RÉDUITE à son espace self-service (pas d'accès gestion).
  if (estMembreSimple(role)) {
    return [{ items: [{ to: '/mon-espace', label: t('shell.nav.monEspace'), icon: LayoutDashboard }] }]
  }

  const communaute: NavItem[] = [{ to: '/membres', label: t('shell.nav.membres'), icon: Users }]
  if (peutVoirReunions(role)) communaute.push({ to: '/reunions', label: t('shell.nav.reunions'), icon: Gavel })
  if (peutVoirFonctions(role)) communaute.push({ to: '/fonctions', label: t('shell.nav.fonctions'), icon: Landmark })
  if (peutVoirConflits(role)) communaute.push({ to: '/conflits', label: t('shell.nav.conflits'), icon: ShieldAlert })
  if (peutVoirCommemorations(role)) communaute.push({ to: '/commemorations', label: t('shell.nav.commemorations'), icon: Flame })

  const finances: NavItem[] = []
  if (peutVoirBareme(role)) finances.push({ to: '/bareme', label: t('shell.nav.baremeAnnuel'), icon: CalendarRange })
  if (peutVoirTresorerie(role)) finances.push({ to: '/tresorerie', label: t('shell.nav.tresorerie'), icon: Wallet })
  if (peutVoirCagnottes(role)) finances.push({ to: '/cagnottes', label: t('shell.nav.cagnottes'), icon: HeartHandshake })
  if (peutVoirAmendes(role)) finances.push({ to: '/amendes', label: t('shell.nav.amendes'), icon: Scale })
  if (peutVoirRapports(role)) finances.push({ to: '/rapports', label: t('shell.nav.rapports'), icon: BarChart3 })

  const administration: NavItem[] = []
  if (peutGererUtilisateurs(role)) administration.push({ to: '/utilisateurs', label: t('shell.nav.utilisateurs'), icon: ShieldUser })
  if (peutVoirAudit(role)) administration.push({ to: '/audit', label: t('shell.nav.audit'), icon: ScrollText })
  if (peutVoirParametres(role)) administration.push({ to: '/parametres', label: t('shell.nav.parametres'), icon: Settings })

  return [
    { items: [{ to: '/dashboard', label: t('shell.nav.tableauDeBord'), icon: LayoutDashboard }] },
    { label: t('shell.nav.groupes.communaute'), items: communaute },
    { label: t('shell.nav.groupes.finances'), items: finances },
    { label: t('shell.nav.groupes.administration'), items: administration },
  ].filter((g) => g.items.length > 0)
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNavGroups()
  const { t } = useTranslation()
  return (
    <nav aria-label={t('shell.nav.ariaPrincipale')} className="flex flex-col gap-5">
      {groups.map((group, gi) => (
        <div key={group.label ?? `groupe-${gi}`} className="flex flex-col gap-1">
          {group.label && (
            <p className="mb-1 px-3 text-3xs font-medium uppercase tracking-[0.14em] text-faint">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
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
        </div>
      ))}
    </nav>
  )
}

// Identité du membre lié (nom/prénom) — cache module : un seul fetch best-effort par session,
// même si le chip est monté deux fois (sidebar desktop + drawer mobile).
let identiteMembreCache: { membreId: string; nom: string; prenom: string } | null = null

function UserChip({ onNavigate }: { onNavigate?: () => void }) {
  const { user, accessToken } = useAuth()
  const { t } = useTranslation()
  const [identite, setIdentite] = useState<{ nom: string; prenom: string } | null>(
    user?.membreId && identiteMembreCache?.membreId === user.membreId ? identiteMembreCache : null,
  )

  // m9 : initiales dérivées du nom/prénom du membre lié quand il existe (comme UtilisateursPage),
  // via le self-service /moi/situation (best-effort : 404 sans fiche → repli e-mail).
  useEffect(() => {
    const membreId = user?.membreId
    if (!membreId || !accessToken || identite) return
    const controller = new AbortController()
    let actif = true
    moiApi
      .situation(accessToken, controller.signal)
      .then((s) => {
        if (!actif) return
        identiteMembreCache = { membreId, nom: s.membre.nom, prenom: s.membre.prenom }
        setIdentite({ nom: s.membre.nom, prenom: s.membre.prenom })
      })
      .catch(() => {
        /* pas de fiche liée ou erreur → initiales e-mail */
      })
    return () => {
      actif = false
      controller.abort()
    }
  }, [user?.membreId, accessToken, identite])

  const initialesMembre = identite
    ? `${identite.prenom?.[0] ?? ''}${identite.nom?.[0] ?? ''}`.trim()
    : ''
  const initials = (initialesMembre || (user?.email ?? '?').slice(0, 2)).toUpperCase()
  return (
    <Link
      to="/mon-profil"
      onClick={onNavigate}
      title={t('shell.monProfil')}
      className="flex items-center gap-3 rounded-xl border border-hairline bg-surface/60 px-3 py-2.5 transition-colors hover:border-hairline-strong hover:bg-surface-2/70"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-brass">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{user?.email}</p>
        <p className="truncate text-xs text-faint">
          {user?.role ? t(`shell.roles.${user.role}`, { defaultValue: user.role }) : user?.role}
        </p>
      </div>
    </Link>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { logout, user } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo → landing publique (/). Sortie volontaire de l'appli, pas la nav interne. */}
      <Link
        to="/"
        onClick={onNavigate}
        title={t('shell.retourAccueilPublic')}
        className="flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:text-brass"
      >
        <NkoniMark className="h-9 w-9 text-lg" />
        <span className="font-display text-xl font-semibold tracking-tight text-foreground">
          NKONI
        </span>
      </Link>

      {/* Organisation en relief : premier repère en entrant dans l'app (bloc menthe discret). */}
      {user?.nomOrganisation && (
        <div className="mt-4 shrink-0 rounded-xl border border-brass/25 bg-brass/[0.06] px-3 py-2.5">
          <p className="text-3xs font-medium uppercase tracking-[0.14em] text-brass/80">
            {t('shell.organisation')}
          </p>
          <p
            className="mt-0.5 truncate font-display text-sm font-semibold text-foreground"
            title={user.nomOrganisation}
          >
            {user.nomOrganisation}
          </p>
        </div>
      )}

      {/* Recherche transverse (⌘K) */}
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          window.dispatchEvent(new Event('nkoni:open-search'))
        }}
        className="mt-6 flex shrink-0 items-center gap-2.5 rounded-xl border border-hairline bg-surface/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-hairline-strong hover:text-foreground"
      >
        <Search className="h-4 w-4 text-faint" aria-hidden="true" />
        <span className="flex-1 text-left">{t('shell.rechercher')}</span>
        <kbd className="rounded border border-hairline-strong px-1.5 py-0.5 text-3xs text-faint">
          {estMac() ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {/* État réseau + file de synchro (§ PWA) — masqué quand en ligne et file vide. */}
      <IndicateurSync className="mt-3 w-full justify-center" />

      {/* Nav scrollable : garantit que la zone compte/déconnexion en bas reste toujours
          visible même quand la liste de liens dépasse la hauteur de l'écran (min-h-0 est
          requis pour qu'un enfant flex puisse défiler au lieu de pousser le reste). */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>

      {/* Zone compte + action destructive (déconnexion), séparée de la navigation (§9).
          shrink-0 : toujours à sa taille pleine, ancrée en bas (jamais poussée hors écran). */}
      <div className="mt-4 shrink-0 space-y-2 border-t border-hairline pt-4">
        <UserChip onNavigate={onNavigate} />
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-terra/10 hover:text-terra disabled:opacity-60"
        >
          <LogOut className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
          {signingOut ? t('shell.deconnexionEnCours') : t('shell.seDeconnecter')}
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
  const { t } = useTranslation()
  const { user } = useAuth()
  const location = useLocation()
  const fermerDrawerRef = useRef<HTMLButtonElement>(null)
  const ouvrirDrawerRef = useRef<HTMLButtonElement>(null)
  const drawerEtaitOuvert = useRef(false)
  const drawerPanneauRef = useRef<HTMLDivElement>(null)
  // Piège de focus + verrou de scroll tant que le drawer est ouvert (a11y §8). Le focus initial
  // reste géré par l'effet existant (bouton fermer) ; le hook ajoute le trap Tab + le verrou body.
  useFocusTrap(drawerPanneauRef, drawer)

  // Ferme le drawer à chaque changement de route.
  useEffect(() => setDrawer(false), [location.pathname])

  // Drawer mobile (M10) : à l'ouverture le focus entre sur le bouton fermer + Échap ferme ;
  // à la fermeture, si le focus est tombé sur <body> (panneau démonté), on le rend au déclencheur.
  useEffect(() => {
    if (drawer) {
      drawerEtaitOuvert.current = true
      fermerDrawerRef.current?.focus()
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !e.defaultPrevented) setDrawer(false)
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
    if (drawerEtaitOuvert.current) {
      drawerEtaitOuvert.current = false
      if (document.activeElement === document.body) ouvrirDrawerRef.current?.focus()
    }
  }, [drawer])

  return (
    <div className="relative min-h-screen">
      {/* Skip-link (M10) : premier focusable — masqué sauf au focus clavier. */}
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:border focus:border-brass/40 focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
      >
        {t('shell.allerAuContenu')}
      </a>

      <div className="nk-aura pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-hairline bg-canvas/80 p-4 backdrop-blur-xl lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Topbar mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-canvas/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/" title={t('shell.retourAccueilPublic')} className="flex shrink-0 items-center gap-2">
          <NkoniMark className="h-8 w-8 text-base" />
          <span className="font-display text-lg font-semibold tracking-tight">NKONI</span>
        </Link>
        {/* Organisation en relief sur mobile aussi (visible sans ouvrir le menu). */}
        {user?.nomOrganisation && (
          <span
            className="mx-2 min-w-0 flex-1 truncate text-center font-display text-sm font-semibold text-brass"
            title={user.nomOrganisation}
          >
            {user.nomOrganisation}
          </span>
        )}
        <button
          type="button"
          ref={ouvrirDrawerRef}
          onClick={() => setDrawer(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline-strong bg-surface-2 text-foreground"
          aria-label={t('shell.ouvrirMenu')}
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
            aria-label={t('shell.fermerMenu')}
          />
          <div
            ref={drawerPanneauRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('shell.menuNavigation')}
            className="nk-toast-in absolute inset-y-0 left-0 w-[17rem] border-r border-hairline bg-canvas p-4"
          >
            <button
              type="button"
              ref={fermerDrawerRef}
              onClick={() => setDrawer(false)}
              // Bouton ABSOLUTE → pas de .tap-target (position:relative le casserait) ; la cible
              // passe à 44px en agrandissant le bouton, ancres ajustées pour garder le X en place.
              className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={t('shell.fermer')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      {/* Contenu — cible du skip-link (tabIndex -1 : focusable par programme uniquement). */}
      <div className="lg:pl-64">
        <div
          id="contenu-principal"
          tabIndex={-1}
          className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10"
        >
          {children}
        </div>
      </div>

      {/* Recherche transverse (⌘K) — montée une fois, globale */}
      <CommandPalette />
    </div>
  )
}

export default AppShell
