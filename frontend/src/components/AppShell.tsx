import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CalendarRange,
  ChevronDown,
  Flame,
  Gavel,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Scale,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldUser,
  UserRound,
  Users,
  Wallet,
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
  peutVoirTontines,
  peutVoirAmendes,
  peutVoirRapports,
  peutVoirTresorerie,
  peutVoirAudit,
  peutVoirParametres,
} from '@/lib/roles'
import { cn } from '@/lib/utils'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { usePopoverFlottant } from '@/components/ui/usePopoverFlottant'
import { useFocusTrap } from '@/hooks/useFocusTrap'

/**
 * Largeur de la colonne de contenu SELON le type de page (finding UX) : une largeur unique ne peut
 * pas servir à la fois un formulaire (confortable étroit) et une table dense (étouffée). Formulaires
 * de saisie et `/parametres` → étroit ; tables denses → large ; défaut → intermédiaire. Appliquée
 * À LA FOIS au contenu et à la barre supérieure pour que le menu compte reste aligné sur le bord du
 * contenu. NB : `/mon-profil` est passé au DÉFAUT (large) en devenant une page à 2 colonnes — le
 * critère est la DENSITÉ du contenu, pas la catégorie « réglages ».
 */
function classeLargeur(pathname: string): string {
  const formulaire =
    pathname === '/parametres' ||
    /\/(nouveau|nouvelle|editer|equilibrage)$/.test(pathname) ||
    pathname.endsWith('/versements/nouveau')
  if (formulaire) return 'max-w-3xl'
  // Tables très denses : pleine largeur utile.
  if (pathname === '/audit' || pathname === '/membres' || pathname === '/utilisateurs') return 'max-w-7xl'
  // Défaut : un cran plus large que l'ancien 5xl (moins de vide sur grand écran).
  return 'max-w-6xl'
}

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
  if (peutVoirTontines(role)) finances.push({ to: '/tontines', label: t('shell.nav.tontines'), icon: RefreshCw })
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
    <nav aria-label={t('shell.nav.ariaPrincipale')} className="flex flex-col gap-6">
      {groups.map((group, gi) => (
        <div key={group.label ?? `groupe-${gi}`} className="flex flex-col gap-1">
          {group.label && (
            <p className="mb-1 px-3 text-2xs font-medium uppercase tracking-[0.14em] text-faint">
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
// réutilisé par le chip du drawer mobile ET le menu compte de la barre supérieure desktop.
let identiteMembreCache: { membreId: string; nom: string; prenom: string } | null = null

/**
 * Initiales de l'utilisateur : dérivées du nom/prénom du membre lié quand il existe (best-effort
 * via /moi/situation), sinon des deux premières lettres de l'e-mail. Partagé (chip mobile + menu
 * compte desktop) pour un rendu identique et un seul fetch par session.
 */
function useInitiales(): string {
  const { user, accessToken } = useAuth()
  const [identite, setIdentite] = useState<{ nom: string; prenom: string } | null>(
    user?.membreId && identiteMembreCache?.membreId === user.membreId ? identiteMembreCache : null,
  )

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
  return (initialesMembre || (user?.email ?? '?').slice(0, 2)).toUpperCase()
}

/** Libellé de rôle traduit (repli sur la valeur brute). */
function useLibelleRole(): string | undefined {
  const { user } = useAuth()
  const { t } = useTranslation()
  return user?.role ? t(`shell.roles.${user.role}`, { defaultValue: user.role }) : undefined
}

/** Chip compte cliquable → Mon profil (drawer mobile, où il n'y a pas de barre supérieure). */
function UserChip({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const initials = useInitiales()
  const role = useLibelleRole()
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
        <p className="truncate text-xs text-faint">{role}</p>
      </div>
    </Link>
  )
}

/**
 * Menu compte de la barre supérieure (desktop) : avatar + rôle → dépliant « Mon profil » /
 * « Se déconnecter ». Rendu en PORTAIL via `usePopoverFlottant` (clic-extérieur + Échap gérés).
 */
function CompteMenu() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const initials = useInitiales()
  const role = useLibelleRole()
  const { containerRef, triggerRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: () => setOpen(false),
    largeurDefaut: 240,
    hauteurDefaut: 180,
  })

  const handleLogout = async () => {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('shell.menuCompte')}
        className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface/60 py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-hairline-strong hover:bg-surface-2/70"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-brass">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[11rem] truncate text-xs font-medium text-foreground">
            {user?.email}
          </span>
          <span className="block truncate text-2xs text-faint">{role}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-faint transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open &&
        rendreFlottant(
          <div className="w-60 overflow-hidden rounded-xl border border-hairline-strong bg-surface p-1.5 shadow-2xl">
            <div className="border-b border-hairline px-2.5 pb-2 pt-1.5">
              <p className="truncate text-sm font-medium text-foreground">{user?.email}</p>
              <p className="truncate text-xs text-faint">{role}</p>
            </div>
            <Link
              to="/mon-profil"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {t('shell.monProfil')}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-terra/10 hover:text-terra-text disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {signingOut ? t('shell.deconnexionEnCours') : t('shell.seDeconnecter')}
            </button>
          </div>,
          { className: 'z-50', 'aria-label': t('shell.menuCompte') },
        )}
    </div>
  )
}

/**
 * Contenu de la nav latérale — ÉPURÉ (finding UX) : logo → navigation, sans recherche ni bloc
 * organisation (l'organisation vit désormais dans la barre supérieure desktop / la topbar mobile).
 * `compte` : n'affiche le chip compte + déconnexion QUE dans le drawer mobile (le desktop a son
 * menu compte dans la barre supérieure). Sans ça, mobile perdrait l'accès profil/déconnexion.
 */
function SidebarContent({ onNavigate, compte }: { onNavigate?: () => void; compte?: boolean }) {
  const { logout } = useAuth()
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

      {/* État réseau + file de synchro (§ PWA) — masqué quand en ligne et file vide. */}
      <IndicateurSync className="mt-4 w-full justify-center" />

      {/* Nav scrollable : garantit que la zone du bas (drawer mobile) reste visible même quand la
          liste dépasse la hauteur de l'écran (min-h-0 requis pour qu'un enfant flex défile). */}
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>

      {/* Compte + déconnexion — DRAWER MOBILE uniquement (le desktop les porte dans la barre
          supérieure). shrink-0 : ancré en bas, jamais poussé hors écran. */}
      {compte && (
        <div className="mt-4 shrink-0 space-y-2 border-t border-hairline pt-4">
          <UserChip onNavigate={onNavigate} />
          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-terra/10 hover:text-terra-text disabled:opacity-60"
          >
            <LogOut className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
            {signingOut ? t('shell.deconnexionEnCours') : t('shell.seDeconnecter')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Barre supérieure desktop : organisation à gauche du cluster droit + menu compte à droite. */
function TopBar({ largeur }: { largeur: string }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-20 hidden border-b border-hairline bg-canvas/80 backdrop-blur-xl lg:block">
      <div className={cn('mx-auto flex h-16 items-center justify-end gap-3 px-5 sm:px-8', largeur)}>
        <IndicateurSync />
        {user?.nomOrganisation && (
          <div
            className="flex min-w-0 items-center gap-2 rounded-xl border border-brass/25 bg-brass/[0.06] px-3 py-1.5"
            title={user.nomOrganisation}
          >
            <Building2 className="h-4 w-4 shrink-0 text-brass/80" aria-hidden="true" />
            <div className="min-w-0 text-right">
              <p className="text-2xs font-medium uppercase leading-tight tracking-[0.14em] text-brass/80">
                {t('shell.organisation')}
              </p>
              <p className="max-w-[16rem] truncate font-display text-sm font-semibold leading-tight text-foreground">
                {user.nomOrganisation}
              </p>
            </div>
          </div>
        )}
        <CompteMenu />
      </div>
    </header>
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
  const largeur = classeLargeur(location.pathname)
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
      {/* `pt-safe-3` = py-3 + encoche : en PWA installée (standalone) le topbar occupait sinon la
          bande d'état, logo et titre passant sous l'heure et les icônes système. */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-canvas/85 px-4 py-3 pt-safe-3 backdrop-blur-xl lg:hidden">
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
        <div className="flex shrink-0 items-center gap-2">
          {/* Recherche transverse (⌘K) — SEUL déclencheur tactile depuis le retrait du bouton
              sidebar ; sans lui la palette serait inatteignable sur mobile (clavier absent). */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('nkoni:open-search'))}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline-strong bg-surface-2 text-foreground"
            aria-label={t('shell.recherche.ariaDialog')}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            ref={ouvrirDrawerRef}
            onClick={() => setDrawer(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline-strong bg-surface-2 text-foreground"
            aria-label={t('shell.ouvrirMenu')}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
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
            // Drawer plein écran (`inset-y-0`) : ses extrémités tombent sous l'encoche EN HAUT et
            // sous la barre de gestes EN BAS — la déconnexion, placée en pied, y devenait
            // difficile à atteindre. Paddings de sécurité additifs (p-4 conservé).
            className="nk-toast-in absolute inset-y-0 left-0 w-[17rem] border-r border-hairline bg-canvas p-4 pb-safe-4 pt-safe-3"
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
            {/* compte : le drawer mobile porte le chip compte + déconnexion (pas de barre supérieure). */}
            <SidebarContent onNavigate={() => setDrawer(false)} compte />
          </div>
        </div>
      )}

      {/* Colonne de contenu — barre supérieure desktop puis contenu centré (cible du skip-link).
          Largeur adaptée au type de page (cf. classeLargeur), partagée avec la barre supérieure. */}
      <div className="lg:pl-64">
        <TopBar largeur={largeur} />
        <div
          id="contenu-principal"
          tabIndex={-1}
          className={cn('mx-auto px-5 py-8 sm:px-8 sm:py-10', largeur)}
        >
          {children}
        </div>
      </div>

      {/* Recherche transverse (⌘K) — montée une fois, globale ; raccourci clavier conservé. */}
      <CommandPalette />
    </div>
  )
}

export default AppShell
