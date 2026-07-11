/**
 * Client HTTP minimal pour l'API NKONI.
 *
 * `credentials: 'include'` est OBLIGATOIRE : c'est ce qui permet au cookie httpOnly
 * du refresh token d'être envoyé/reçu en cross-origin (le back autorise CORS avec
 * credentials sur l'origine du front).
 */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export interface AuthUser {
  id: string
  email: string
  role: string
  membreId?: string | null
  /** Préférence de langue perso (§4). null/absent = non exprimée (le front suit son localStorage). */
  langue?: 'FR' | 'EN' | null
  /** Devise de l'organisation (§5, immuable) → formatage des montants (F6). null pour le SUPER_ADMIN. */
  devise?: 'FCFA' | 'EUR' | 'USD' | 'CAD' | null
  /** Nom de l'organisation d'appartenance → mis en relief en tête d'interface. null pour le SUPER_ADMIN. */
  nomOrganisation?: string | null
}

/** Réponse de PATCH /auth/me/langue : nouveau token (portant la langue) + langue enregistrée. */
export interface LangueResponse {
  accessToken: string
  langue: 'FR' | 'EN'
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

/** Auto-inscription (§3.1) : création d'une organisation + son admin fondateur. */
export interface InscriptionInput {
  nomOrganisation: string
  devise: 'FCFA' | 'EUR' | 'USD' | 'CAD'
  langue: 'FR' | 'EN'
  email: string
  password: string
}

export interface RefreshResponse {
  accessToken: string
}

/** Erreur porteuse du code HTTP, pour un traitement fin côté UI (401, 403, …). */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Traduit une erreur d'appel API en message lisible pour l'UI.
 *
 * - `ApiError` (le serveur A répondu, avec un statut d'erreur) → message du serveur.
 * - Sinon, `fetch` a **rejeté** sans réponse : réseau coupé, serveur injoignable, ou —
 *   cas fréquent — requête **bloquée par la politique CORS** (origine non autorisée).
 *   On loggue l'erreur brute (diagnostic) et on renvoie un message explicite plutôt
 *   qu'un « Erreur de chargement » opaque.
 */
export function messageErreur(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof DOMException && e.name === 'AbortError') return 'Requête annulée.'
  // eslint-disable-next-line no-console
  console.error('[NKONI] Appel API en échec (réseau ou CORS/origine non autorisée) :', e)
  return 'Impossible de contacter le serveur (réseau, ou origine non autorisée par le CORS).'
}

/* -------------------------------------------------------------------------- */
/* Rafraîchissement silencieux du token (refresh-on-401)                       */
/* -------------------------------------------------------------------------- */

/**
 * Pont entre le client HTTP (module, hors React) et `AuthContext`. Ce dernier enregistre ses
 * callbacks au montage ; le client s'en sert pour propager un access token rafraîchi et pour
 * déclencher une déconnexion propre quand le refresh échoue.
 */
interface AuthBridge {
  /** Un nouvel access token vient d'être obtenu → AuthContext remplace le sien (setState). */
  onTokenRefreshed?: (accessToken: string) => void
  /** Le refresh a échoué (cookie expiré/absent) → AuthContext vide la session (→ /login). */
  onSessionExpired?: () => void
}
const authBridge: AuthBridge = {}
export function configurerAuthBridge(bridge: AuthBridge): void {
  authBridge.onTokenRefreshed = bridge.onTokenRefreshed
  authBridge.onSessionExpired = bridge.onSessionExpired
}

/**
 * Rafraîchit l'access token via le cookie refresh (POST /auth/refresh), en DÉDUPLIQUANT les
 * appels concurrents : si plusieurs requêtes tombent en 401 en même temps, un SEUL /auth/refresh
 * part et toutes attendent le même résultat (pas de rafale). Retourne le nouveau token, ou `null`
 * si le refresh échoue. Exposée pour permettre aussi un refresh PROACTIF (avant expiration).
 */
let refreshEnCours: Promise<string | null> | null = null
export function rafraichirAccessToken(): Promise<string | null> {
  if (!refreshEnCours) {
    refreshEnCours = fetchRefresh()
      .then((token) => {
        authBridge.onTokenRefreshed?.(token)
        return token
      })
      .catch(() => null)
      .finally(() => {
        refreshEnCours = null
      })
  }
  return refreshEnCours
}

/** Appel brut à /auth/refresh (hors `request`, donc jamais soumis à la logique de retry). */
async function fetchRefresh(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new ApiError(res.status, 'refresh échoué')
  const data = (await res.json()) as RefreshResponse
  return data.accessToken
}

interface RequestOptions {
  method?: string
  json?: unknown
  accessToken?: string | null
  signal?: AbortSignal
  /** Clé d'idempotence (§ PWA hors-ligne) → en-tête `Idempotence-Key` (rejeu sans doublon). */
  cleIdempotence?: string
  /** Interne : passe à false sur la requête REJOUÉE pour interdire une seconde tentative (anti-boucle). */
  permettreRetry?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, accessToken, signal, permettreRetry = true, cleIdempotence } = options

  const headers: Record<string, string> = {}
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  if (cleIdempotence) headers['Idempotence-Key'] = cleIdempotence

  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
    signal,
  })

  // Refresh-on-401 : un access token expiré → on tente UN refresh silencieux (dédupliqué) puis on
  // rejoue la requête UNE fois avec le nouveau token. Conditions strictes anti-boucle :
  //   - `permettreRetry` (déjà false sur la requête rejouée),
  //   - `accessToken != null` : un flux public (login/inscription/refresh) n'est jamais rejoué.
  if (res.status === 401 && permettreRetry && accessToken != null) {
    const nouveauToken = await rafraichirAccessToken()
    if (nouveauToken) {
      return request<T>(path, { ...options, accessToken: nouveauToken, permettreRetry: false })
    }
    // Refresh impossible → session terminée : déconnexion propre (AuthContext videra l'état,
    // ProtectedRoute redirige vers /login). On laisse ensuite l'erreur 401 se propager.
    authBridge.onSessionExpired?.()
  }

  // 204 No Content (ex. logout) → pas de corps à parser.
  if (res.status === 204) return undefined as T

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Erreur ${res.status}`
    throw new ApiError(res.status, message)
  }

  return data as T
}

export const authApi = {
  // `rememberMe` allonge la durée de la session (refresh 30 j au lieu de 7 j) côté back.
  // Le mot de passe n'est JAMAIS transmis pour être stocké : il ne sert qu'à cette requête.
  login: (email: string, password: string, rememberMe: boolean) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password, rememberMe },
    }),
  // Auto-inscription publique : crée l'organisation + l'admin fondateur et connecte
  // directement (même forme de réponse qu'un login : accessToken + user + cookie refresh).
  inscription: (input: InscriptionInput) =>
    request<LoginResponse>('/organisations/inscription', { method: 'POST', json: input }),
  refresh: (signal?: AbortSignal) =>
    request<RefreshResponse>('/auth/refresh', { method: 'POST', signal }),
  me: (accessToken: string, signal?: AbortSignal) =>
    request<AuthUser>('/auth/me', { accessToken, signal }),
  // Préférence de langue perso (§4) : persiste côté serveur et réémet un access token portant
  // la nouvelle langue (le front remplace son token en mémoire).
  setLangue: (langue: 'FR' | 'EN', accessToken: string) =>
    request<LangueResponse>('/auth/me/langue', {
      method: 'PATCH',
      json: { langue },
      accessToken,
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  // Changement self-service : l'utilisateur connecté change SON propre mot de passe.
  // L'ancien est vérifié côté back (401 si incorrect).
  changerMotDePasse: (
    ancienMotDePasse: string,
    nouveauMotDePasse: string,
    accessToken: string,
  ) =>
    request<void>('/auth/changer-mot-de-passe', {
      method: 'POST',
      json: { ancienMotDePasse, nouveauMotDePasse },
      accessToken,
    }),
}

/**
 * Rôle plateforme SUPER_ADMIN (SaaS §2.3) — vue d'une organisation cliente.
 * Aucune donnée métier : uniquement statut, date de création et volume (nb membres).
 */
export interface PlatformOrganisation {
  id: string
  nom: string
  devise: 'FCFA' | 'EUR' | 'USD' | 'CAD'
  langueDefaut: 'FR' | 'EN'
  actif: boolean
  createdAt: string
  nbMembres: number
}

/** Réponse des mutations de statut (organisation renvoyée sans le compteur de membres). */
type OrganisationStatut = Omit<PlatformOrganisation, 'nbMembres'>

export const platformApi = {
  listOrganisations: (accessToken: string, signal?: AbortSignal) =>
    request<{ organisations: PlatformOrganisation[] }>('/platform/organisations', {
      accessToken,
      signal,
    }),
  suspendre: (id: string, accessToken: string) =>
    request<{ organisation: OrganisationStatut }>(`/platform/organisations/${id}/suspendre`, {
      method: 'POST',
      accessToken,
    }),
  reactiver: (id: string, accessToken: string) =>
    request<{ organisation: OrganisationStatut }>(`/platform/organisations/${id}/reactiver`, {
      method: 'POST',
      accessToken,
    }),
}

/**
 * Paramètres de l'organisation COURANTE (§5) — vue lecture seule (nom/devise/langue immuables)
 * + volume de membres face à la limite du forfait gratuit. Accessible au bureau (pas MEMBRE_SIMPLE).
 */
export interface OrganisationCourante {
  id: string
  nom: string
  devise: 'FCFA' | 'EUR' | 'USD' | 'CAD'
  langueDefaut: 'FR' | 'EN'
  createdAt: string
  nbMembres: number
  limiteMembres: number
  /** Chef de l'organisation (Membre désigné) — null si non désigné. */
  chefMembreId: string | null
  chefSurnom: string | null
  chefNom: string | null
  chefPrenom: string | null
}

/** Réponse de PATCH /organisations/moi/chef : le chef courant après désignation/retrait. */
export interface ChefOrganisation {
  chefMembreId: string | null
  chefSurnom: string | null
  chefNom: string | null
  chefPrenom: string | null
}

export const organisationApi = {
  moi: (accessToken: string, signal?: AbortSignal) =>
    request<OrganisationCourante>('/organisations/moi', { accessToken, signal }),
  /** Désigne (`membreId`) ou retire (`membreId: null`) le chef de l'organisation. ADMIN/PRESIDENT. */
  definirChef: (
    membreId: string | null,
    surnom: string | null,
    accessToken: string,
  ) =>
    request<ChefOrganisation>('/organisations/moi/chef', {
      method: 'PATCH',
      json: { membreId, surnom },
      accessToken,
    }),
}

/* -------------------------------------------------------------------------- */
/* Tableau de bord (§5.8) — 4 vues selon le rôle (discriminées par `vue`)     */
/* -------------------------------------------------------------------------- */

export type StatutContribution = 'A_JOUR' | 'PARTIEL' | 'NON_A_JOUR'

export interface Finances {
  totalAttenduCumule: number
  totalCollecteCumule: number
  /** Taux de recouvrement en % (collecté / attendu). */
  tauxRecouvrement: number
}

export interface RepartitionStatutContribution {
  A_JOUR: number
  PARTIEL: number
  NON_A_JOUR: number
}

export interface RepartitionStatutMembre {
  ACTIF: number
  INACTIF: number
  DECEDE: number
}

/** Un point de l'évolution mensuelle du recouvrement (année courante). */
export interface EvolutionMois {
  /** Mois 1 (janvier) → 12 (décembre). */
  mois: number
  collecte: number
  attendu: number
}

export interface DashboardComplet {
  vue: 'COMPLET'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  membresParStatutMembre: RepartitionStatutMembre
  /** 12 entrées (janv.→déc.) : collecté mensuel vs cible mensuelle sur l'année courante. */
  evolutionMensuelle: EvolutionMois[]
  nombreBranches: number
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardFinancier {
  vue: 'FINANCIER'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  alertes: { baremeAnneeCouranteManquant: boolean }
}

export interface DashboardRestreint {
  vue: 'RESTREINT'
  membresParStatutMembre: RepartitionStatutMembre
  nombreBranches: number
}

export interface DashboardPerso {
  vue: 'PERSO'
  membreId: string
  anneeCourante: number
  totalAttenduCumule: number
  totalValoriseCumule: number
  statut: StatutContribution
}

export type Dashboard =
  | DashboardComplet
  | DashboardFinancier
  | DashboardRestreint
  | DashboardPerso

export const dashboardApi = {
  get: (accessToken: string, signal?: AbortSignal) =>
    request<Dashboard>('/dashboard', { accessToken, signal }),
}

/* -------------------------------------------------------------------------- */
/* Rapports financiers (enrichissement) — agrégations par année               */
/* -------------------------------------------------------------------------- */

export interface RapportAnnee {
  annee: number
  montantAttendu: number
  membresEligibles: number
  totalAttendu: number
  totalCollecte: number
  tauxRecouvrement: number
  membresParStatut: RepartitionStatutContribution
}

export interface RapportFinancier {
  anneeDebut: number
  anneeFin: number
  /** Une entrée par année de la plage ayant un barème (années non configurées absentes). */
  annees: RapportAnnee[]
}

/** `number` = % ; `'nouveau'` = apparition (base 0 → positif) ; `null` = incomparable / 0→0. */
export type Variation = number | 'nouveau' | null

export interface VariationsComparaison {
  totalAttendu: Variation
  totalCollecte: Variation
  tauxRecouvrement: Variation
}

export interface ComparaisonPeriodes {
  anneeA: number
  anneeB: number
  /** null si l'année n'a pas de barème configuré (ignorée). */
  rapportA: RapportAnnee | null
  rapportB: RapportAnnee | null
  variations: VariationsComparaison
}

export interface AnneeComparee {
  annee: number
  /** null si l'année n'a pas de barème configuré (ignorée). */
  rapport: RapportAnnee | null
  /** Variation vs l'année précédente DANS LA LISTE (null pour la 1re). */
  variations: VariationsComparaison | null
}

export interface ComparaisonMulti {
  annees: AnneeComparee[]
}

/** Détail par membre pour une année (même source que l'export des contributions §5.9). */
export interface DetailMembreLigne {
  membreId: string
  nom: string
  prenom: string
  montantAttendu: number
  montantVerse: number
  montantValorise: number
  statut: StatutContribution
}

export interface DetailMembres {
  annee: number
  genereLe: string
  lignes: DetailMembreLigne[]
  totaux: { montantAttendu: number; montantVerse: number; montantValorise: number }
}

/* -------------------------------------------------------------------------- */
/* Notifications (§5) — préférences par type                                  */
/* -------------------------------------------------------------------------- */

export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD'
export type PreferencesNotification = Record<TypeNotification, boolean>

export const notificationsApi = {
  getPreferences: (accessToken: string, signal?: AbortSignal) =>
    request<PreferencesNotification>('/notifications/preferences', { accessToken, signal }),
  updatePreferences: (patch: Partial<PreferencesNotification>, accessToken: string) =>
    request<PreferencesNotification>('/notifications/preferences', {
      method: 'PATCH',
      json: patch,
      accessToken,
    }),
}

export const rapportsApi = {
  financier: (anneeDebut: number, anneeFin: number, accessToken: string, signal?: AbortSignal) =>
    request<RapportFinancier>(
      `/rapports/financier?anneeDebut=${anneeDebut}&anneeFin=${anneeFin}`,
      { accessToken, signal },
    ),
  comparaison: (anneeA: number, anneeB: number, accessToken: string, signal?: AbortSignal) =>
    request<ComparaisonPeriodes>(
      `/rapports/comparaison?anneeA=${anneeA}&anneeB=${anneeB}`,
      { accessToken, signal },
    ),
  /** Comparaison de N années (chaîne de variations). `annees` triées côté appelant. */
  comparaisonMulti: (annees: number[], accessToken: string, signal?: AbortSignal) =>
    request<ComparaisonMulti>(`/rapports/comparaison?annees=${annees.join(',')}`, {
      accessToken,
      signal,
    }),
  /** Détail par membre pour une année (tableau consultable ; même source que l'export). */
  detailMembres: (annee: number, accessToken: string, signal?: AbortSignal) =>
    request<DetailMembres>(`/rapports/detail-membres?annee=${annee}`, { accessToken, signal }),
}

/* -------------------------------------------------------------------------- */
/* Export des contributions (§5.9) — téléchargement binaire (PDF/Excel)       */
/* -------------------------------------------------------------------------- */

export interface ExportParams {
  format: 'xlsx' | 'pdf'
  annee?: number
  membreId?: string
}

/** Extrait le nom de fichier d'un en-tête `Content-Disposition`. */
function nomFichierDepuisDisposition(disposition: string | null): string | null {
  if (!disposition) return null
  const match = /filename="?([^"]+)"?/.exec(disposition)
  return match ? match[1] : null
}

/**
 * Télécharge l'export des contributions et déclenche l'enregistrement du fichier.
 *
 * L'access token étant gardé en mémoire (pas de cookie d'access), on ne peut pas utiliser
 * un simple `<a href>` : on fait un fetch authentifié, on lit le corps en Blob, puis on
 * force le téléchargement via un lien object-URL éphémère.
 */
export async function downloadExportContributions(
  params: ExportParams,
  accessToken: string,
): Promise<void> {
  const qs = new URLSearchParams({ format: params.format })
  if (params.annee !== undefined) qs.set('annee', String(params.annee))
  if (params.membreId) qs.set('membreId', params.membreId)

  const res = await fetch(`${API_URL}/exports/contributions?${qs.toString()}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const data = (await res.json()) as { message?: unknown }
      if (data?.message) message = String(data.message)
    } catch {
      // corps non-JSON : on garde le message générique
    }
    throw new ApiError(res.status, message)
  }

  const blob = await res.blob()
  const filename =
    nomFichierDepuisDisposition(res.headers.get('Content-Disposition')) ??
    `contributions.${params.format}`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Télécharge un fichier binaire authentifié (fetch → Blob → lien object-URL éphémère),
 * en respectant le nom de fichier du `Content-Disposition` (repli sur `fallbackName`).
 * Base commune aux exports de rapports.
 */
async function telechargerBinaire(
  path: string,
  fallbackName: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const data = (await res.json()) as { message?: unknown }
      if (data?.message) message = String(data.message)
    } catch {
      // corps non-JSON : message générique conservé
    }
    throw new ApiError(res.status, message)
  }
  const blob = await res.blob()
  const filename =
    nomFichierDepuisDisposition(res.headers.get('Content-Disposition')) ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Export du rapport d'évolution (plage d'années) en Excel/PDF. */
export function downloadRapportFinancier(
  anneeDebut: number,
  anneeFin: number,
  format: 'xlsx' | 'pdf',
  accessToken: string,
): Promise<void> {
  return telechargerBinaire(
    `/rapports/financier/export?anneeDebut=${anneeDebut}&anneeFin=${anneeFin}&format=${format}`,
    `rapport-financier-${anneeDebut}-${anneeFin}.${format}`,
    accessToken,
  )
}

/** Export de la comparaison de deux années en Excel/PDF. */
export function downloadRapportComparaison(
  anneeA: number,
  anneeB: number,
  format: 'xlsx' | 'pdf',
  accessToken: string,
): Promise<void> {
  return telechargerBinaire(
    `/rapports/comparaison/export?anneeA=${anneeA}&anneeB=${anneeB}&format=${format}`,
    `comparaison-${anneeA}-${anneeB}.${format}`,
    accessToken,
  )
}

/** Export de la comparaison de N années en Excel/PDF (nom de fichier = toutes les années). */
export function downloadRapportComparaisonMulti(
  annees: number[],
  format: 'xlsx' | 'pdf',
  accessToken: string,
): Promise<void> {
  return telechargerBinaire(
    `/rapports/comparaison/export?annees=${annees.join(',')}&format=${format}`,
    `comparaison-${annees.join('-')}.${format}`,
    accessToken,
  )
}

/* -------------------------------------------------------------------------- */
/* Membres, Branches, Contributions (§5.2 / §4.1)                            */
/* -------------------------------------------------------------------------- */

export type StatutMembre = 'ACTIF' | 'INACTIF' | 'DECEDE'

export interface Branche {
  id: string
  nom: string
  description?: string | null
}

/** Ligne de la liste enrichie GET /membres/statuts (statut cotisation calculé en masse). */
export interface MembreStatut {
  id: string
  nom: string
  prenom: string
  sexe: string | null
  statut: StatutMembre
  telephone: string | null
  brancheId: string | null
  branche: { id: string; nom: string } | null
  anneeAdhesion: number
  anneeFinContribution: number | null
  statutCotisation: StatutContribution
  totalAttenduCumule: number
  totalValoriseCumule: number
}

/** Fiche complète GET /membres/:id. */
export interface Membre {
  id: string
  nom: string
  prenom: string
  sexe: string | null
  dateNaissance: string | null
  fonctionSociale: string | null
  statut: StatutMembre
  telephone: string | null
  adresse: string | null
  brancheId: string | null
  chefSousFamilleId: string | null
  anneeAdhesion: number
  anneeFinContribution: number | null
  dateDeces: string | null
  compteUtilisateurId: string | null
  createdAt: string
  updatedAt: string
}

/** Corps de création/mise à jour d'un membre (champs optionnels omis si vides). */
export interface MembreInput {
  nom: string
  prenom: string
  anneeAdhesion: number
  sexe?: string
  dateNaissance?: string
  fonctionSociale?: string
  statut?: StatutMembre
  telephone?: string
  adresse?: string
  brancheId?: string
  chefSousFamilleId?: string
  anneeFinContribution?: number
}

export interface StatutCumule {
  totalAttenduCumule: number
  totalValoriseCumule: number
  statut: StatutContribution
}

export interface Contribution {
  id: string
  membreId: string
  annee: number
  montantAttendu: number
  montantVerse: number
  montantValorise: number
}

export const membresApi = {
  listStatuts: (accessToken: string, signal?: AbortSignal) =>
    request<MembreStatut[]>('/membres/statuts', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Membre>(`/membres/${id}`, { accessToken, signal }),
  statut: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<StatutCumule>(`/membres/${id}/statut`, { accessToken, signal }),
  create: (body: MembreInput, accessToken: string, cleIdempotence?: string) =>
    request<Membre>('/membres', {
      method: 'POST',
      json: body,
      accessToken,
      ...(cleIdempotence ? { cleIdempotence } : {}),
    }),
  update: (id: string, body: Partial<MembreInput>, accessToken: string) =>
    request<Membre>(`/membres/${id}`, { method: 'PATCH', json: body, accessToken }),
  /** Télécharge la CARTE de membre (PDF) via le proxy authentifié (QR de vérif. de statut). */
  telechargerCarte: async (id: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/membres/${rid(id)}/carte`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Télécharge TOUTES les cartes en un PDF (grille A4 découpable). */
  telechargerCartesLot: async (accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/membres/cartes`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Aperçu d'import (valider=true) → rapport, aucune écriture. */
  importerApercu: (membres: LigneImport[], creerBranchesManquantes: boolean, accessToken: string) =>
    request<RapportImport>('/membres/import', {
      method: 'POST',
      json: { membres, valider: true, creerBranchesManquantes },
      accessToken,
    }),
  /** Commit d'import → { crees, ignores } (201) ; lève ApiError si quota (403) / erreurs (422). */
  importerCommit: (membres: LigneImport[], creerBranchesManquantes: boolean, accessToken: string) =>
    request<ResultatImport>('/membres/import', {
      method: 'POST',
      json: { membres, valider: false, creerBranchesManquantes },
      accessToken,
    }),
}

/* Import CSV/Excel des membres (§5.2) --------------------------------------- */

/** Une ligne d'import (valeurs issues du mapping ; nombres tolérés en chaîne). */
export interface LigneImport {
  nom?: string
  prenom?: string
  anneeAdhesion?: number | string
  sexe?: string
  dateNaissance?: string
  telephone?: string
  adresse?: string
  fonctionSociale?: string
  statut?: string
  anneeFinContribution?: number | string
  dateDeces?: string
  branche?: string
}

export interface ErreurImport {
  ligne: number
  champ: string
  message: string
}
export interface DoublonImport {
  ligne: number
  nom: string
  prenom: string
}
export interface RapportImport {
  valides: number
  doublons: DoublonImport[]
  erreurs: ErreurImport[]
  quota: { actuel: number; plafond: number; aCreer: number; depasse: boolean }
}
export interface ResultatImport {
  crees: number
  ignores: number
}

/* Espace membre self-service (§5) — routes /moi/* --------------------------- */

export interface SituationMembre {
  membre: {
    nom: string
    prenom: string
    branche: string | null
    statut: string
    anneeAdhesion: number
  }
  cotisation: { statut: StatutContribution; totalDu: number; totalVerse: number }
}
export interface ContributionMembre {
  id: string
  annee: number
  montantAttendu: number
  montantVerse: number
  montantValorise: number
  versements: { id: string; montant: number; dateVersement: string; mode: string }[]
}
export interface ReunionAVenir {
  id: string
  date: string
  lieu: string
  type: string
  statut: string
}
export interface RecuMembre {
  id: string
  numero: string
  date: string
  montant: number
  telechargeable: boolean
}

export const moiApi = {
  situation: (accessToken: string, signal?: AbortSignal) =>
    request<SituationMembre>('/moi/situation', { accessToken, signal }),
  contributions: (accessToken: string, signal?: AbortSignal) =>
    request<ContributionMembre[]>('/moi/contributions', { accessToken, signal }),
  reunions: (accessToken: string, signal?: AbortSignal) =>
    request<ReunionAVenir[]>('/moi/reunions', { accessToken, signal }),
  recus: (accessToken: string, signal?: AbortSignal) =>
    request<RecuMembre[]>('/moi/recus', { accessToken, signal }),
}

export const branchesApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Branche[]>('/branches', { accessToken, signal }),
}

export interface Bareme {
  id: string
  annee: number
  montantAttendu: number
  createdAt: string
}

export const baremeApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Bareme[]>('/baremes', { accessToken, signal }),
  create: (annee: number, montantAttendu: number, accessToken: string) =>
    request<Bareme>('/baremes', {
      method: 'POST',
      json: { annee, montantAttendu },
      accessToken,
    }),
  update: (id: string, montantAttendu: number, accessToken: string) =>
    request<Bareme>(`/baremes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: { montantAttendu },
      accessToken,
    }),
}

export interface OuvrirAnneeResult {
  annee: number
  montantAttendu: number
  membresEligibles: number
  contributionsCreees: number
}

export const contributionsApi = {
  listByMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Contribution[]>(`/contributions?membreId=${encodeURIComponent(membreId)}`, {
      accessToken,
      signal,
    }),
  ouvrirAnnee: (annee: number, accessToken: string) =>
    request<OuvrirAnneeResult>('/contributions/ouvrir-annee', {
      method: 'POST',
      json: { annee },
      accessToken,
    }),
}

/* -------------------------------------------------------------------------- */
/* Versements & Reçus (§4.4 / §4.6)                                          */
/* -------------------------------------------------------------------------- */

export type ModeVersement = 'ESPECES' | 'TIERS' | 'AUTRE'

export interface Versement {
  id: string
  contributionId: string
  montant: number
  dateVersement: string
  mode: ModeVersement
  receptionnaireId: string | null
  note: string | null
  createdAt: string
}

export interface VersementInput {
  contributionId: string
  montant: number
  dateVersement: string
  mode: ModeVersement
  note?: string
}

/** Champs modifiables d'un versement (PATCH /versements/:id) — tous optionnels. */
export interface VersementUpdateInput {
  montant?: number
  dateVersement?: string
  mode?: ModeVersement
  note?: string | null
}

/** Réponse de POST /versements : le versement + la contribution aux totaux réajustés. */
export interface VersementCree {
  versement: Versement
  contribution: Contribution
}

export interface Recu {
  id: string
  versementId: string
  numero: string
  genereParId: string
  dateGeneration: string
  urlPdf: string | null
  /** Jeton signé du lien PUBLIC de téléchargement (partage WhatsApp), fourni par le backend. */
  signaturePartage: string
}

export const versementsApi = {
  listByContribution: (contributionId: string, accessToken: string, signal?: AbortSignal) =>
    request<Versement[]>(
      `/versements?contributionId=${encodeURIComponent(contributionId)}`,
      { accessToken, signal },
    ),
  create: (body: VersementInput, accessToken: string, cleIdempotence?: string) =>
    request<VersementCree>('/versements', {
      method: 'POST',
      json: body,
      accessToken,
      ...(cleIdempotence ? { cleIdempotence } : {}),
    }),
  /** Modifie un versement (PATCH). Le back reporte automatiquement le delta sur les totaux. */
  modifier: (versementId: string, body: VersementUpdateInput, accessToken: string) =>
    request<Versement>(`/versements/${encodeURIComponent(versementId)}`, {
      method: 'PATCH',
      json: body,
      accessToken,
    }),
  /** Supprime un versement (DELETE). Le back décrémente montantVerse & montantValorise. */
  supprimer: (versementId: string, accessToken: string) =>
    request<void>(`/versements/${encodeURIComponent(versementId)}`, {
      method: 'DELETE',
      accessToken,
    }),
}

export const recusApi = {
  listByMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Recu[]>(`/recus?membreId=${encodeURIComponent(membreId)}`, { accessToken, signal }),
  generer: (versementId: string, accessToken: string) =>
    request<Recu>(`/versements/${encodeURIComponent(versementId)}/recu`, {
      method: 'POST',
      accessToken,
    }),
  /** Télécharge le PDF du reçu via le proxy authentifié (généré à la demande, Blob privé). */
  telecharger: async (recuId: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/recus/${rid(recuId)}/pdf`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Envoie le reçu au membre par WhatsApp (best-effort côté serveur, Meta Cloud API). */
  envoyerWhatsApp: (recuId: string, accessToken: string) =>
    request<{ envoye: boolean; raison?: string }>(`/recus/${rid(recuId)}/whatsapp`, {
      method: 'POST',
      accessToken,
    }),
  /**
   * URL PUBLIQUE ABSOLUE de téléchargement du reçu (lien à partager, ex. via `wa.me`). Passe par
   * le proxy `/api/*` same-origin en prod ; `new URL(..., origin)` la rend absolue quel que soit
   * `API_URL` (relatif `/api` en prod, absolu en dev). Le membre télécharge sans compte : c'est
   * la signature qui autorise (cf. backend `GET /recus/:id/pdf-public`).
   */
  urlPartage: (recu: Recu): string =>
    new URL(
      `${API_URL}/recus/${rid(recu.id)}/pdf-public?t=${encodeURIComponent(recu.signaturePartage)}`,
      window.location.origin,
    ).href,
}

/* Trésorerie / dépenses (§5) ------------------------------------------------ */

export type StatutDepense = 'BROUILLON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE' | 'PAYEE'
export type CategorieDepense = 'AIDE_MEMBRE' | 'FUNERAILLES' | 'EVENEMENT' | 'FONCTIONNEMENT' | 'AUTRE'

export interface Depense {
  id: string
  montant: number
  date: string
  description: string
  categorie: CategorieDepense
  statut: StatutDepense
  beneficiaireMembreId: string | null
  saisiParId: string
  approuveParId: string | null
  motifRejet: string | null
  createdAt: string
  updatedAt: string
}
export interface SoldeTresorerie {
  entrees: number
  sorties: number
  solde: number
  parCategorie: { categorie: CategorieDepense; total: number }[]
}
export interface DepenseInput {
  montant: number
  date: string
  description: string
  categorie?: CategorieDepense
  beneficiaireMembreId?: string
  statut?: 'BROUILLON' | 'EN_ATTENTE'
}
export interface FiltreDepenses {
  statut?: StatutDepense
  categorie?: CategorieDepense
  dateDebut?: string
  dateFin?: string
}

function qsDepenses(f: FiltreDepenses = {}): string {
  const p = new URLSearchParams()
  if (f.statut) p.set('statut', f.statut)
  if (f.categorie) p.set('categorie', f.categorie)
  if (f.dateDebut) p.set('dateDebut', f.dateDebut)
  if (f.dateFin) p.set('dateFin', f.dateFin)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const depensesApi = {
  solde: (filtre: FiltreDepenses, accessToken: string, signal?: AbortSignal) =>
    request<SoldeTresorerie>(`/tresorerie${qsDepenses(filtre)}`, { accessToken, signal }),
  list: (filtre: FiltreDepenses, accessToken: string, signal?: AbortSignal) =>
    request<Depense[]>(`/depenses${qsDepenses(filtre)}`, { accessToken, signal }),
  create: (body: DepenseInput, accessToken: string) =>
    request<Depense>('/depenses', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: Partial<DepenseInput>, accessToken: string) =>
    request<Depense>(`/depenses/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/depenses/${rid(id)}`, { method: 'DELETE', accessToken }),
  approuver: (id: string, accessToken: string) =>
    request<Depense>(`/depenses/${rid(id)}/approuver`, { method: 'POST', accessToken }),
  rejeter: (id: string, motifRejet: string, accessToken: string) =>
    request<Depense>(`/depenses/${rid(id)}/rejeter`, { method: 'POST', json: { motifRejet }, accessToken }),
  marquerPayee: (id: string, accessToken: string) =>
    request<Depense>(`/depenses/${rid(id)}/marquer-payee`, { method: 'POST', accessToken }),
}

/* -------------------------------------------------------------------------- */
/* Équilibrage entre années (§4.3)                                           */
/* -------------------------------------------------------------------------- */

/** Une ligne de simulation : ce que deviendrait une année (aucune écriture). */
export interface SimulationLigne {
  annee: number
  montantAvant: number
  montantPropose: number
}

/** Réponse de POST /equilibrages/simuler — preview pure. */
export interface SimulationEquilibrage {
  membreId: string
  anneeDebut: number
  anneeFin: number
  nombreAnnees: number
  /** Somme conservée : la répartition ajustée doit rester égale à cette valeur. */
  totalPeriode: number
  repartition: SimulationLigne[]
}

/** Détail avant/après d'un équilibrage appliqué (trace d'audit). */
export interface EquilibrageDetail {
  id: string
  annee: number
  montantAvant: number
  montantApres: number
}

/** Équilibrage appliqué, tel que renvoyé par GET /equilibrages. */
export interface Equilibrage {
  id: string
  membreId: string
  anneeDebut: number
  anneeFin: number
  totalPeriode: number
  auteurId: string
  dateApplication: string
  details: EquilibrageDetail[]
}

export interface AppliquerEquilibrageInput {
  membreId: string
  anneeDebut: number
  anneeFin: number
  /** Montants ajustés (ordre croissant par année) ; omis = répartition proposée. */
  montantsAjustes?: number[]
}

export const equilibragesApi = {
  simuler: (
    body: { membreId: string; anneeDebut: number; anneeFin: number },
    accessToken: string,
  ) =>
    request<SimulationEquilibrage>('/equilibrages/simuler', {
      method: 'POST',
      json: body,
      accessToken,
    }),
  appliquer: (body: AppliquerEquilibrageInput, accessToken: string) =>
    request<{ equilibrage: Equilibrage; totalPeriode: number; nombreAnnees: number }>(
      '/equilibrages',
      { method: 'POST', json: body, accessToken },
    ),
  listByMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Equilibrage[]>(`/equilibrages?membreId=${encodeURIComponent(membreId)}`, {
      accessToken,
      signal,
    }),
}

/* -------------------------------------------------------------------------- */
/* Utilisateurs — gestion des comptes (§4.5, ADMIN uniquement)               */
/* -------------------------------------------------------------------------- */

/** Membre rattaché à un compte (le cas échéant). */
export interface UtilisateurMembreLie {
  id: string
  nom: string
  prenom: string
}

/** Compte utilisateur (jamais de passwordHash exposé par l'API). */
export interface Utilisateur {
  id: string
  email: string
  role: string
  actif: boolean
  createdAt: string
  updatedAt: string
  membre: UtilisateurMembreLie | null
}

export interface UtilisateurCreateInput {
  email: string
  password: string
  role: string
  membreId?: string
}

export interface UtilisateurUpdateInput {
  role?: string
  actif?: boolean
}

export const utilisateursApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Utilisateur[]>('/utilisateurs', { accessToken, signal }),
  create: (body: UtilisateurCreateInput, accessToken: string) =>
    request<Utilisateur>('/utilisateurs', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: UtilisateurUpdateInput, accessToken: string) =>
    request<Utilisateur>(`/utilisateurs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: body,
      accessToken,
    }),
  // Réinitialisation ADMIN : impose un nouveau mot de passe à un AUTRE compte sans
  // connaître l'ancien (dépannage). 204 sans corps.
  reinitialiserMotDePasse: (id: string, nouveauMotDePasse: string, accessToken: string) =>
    request<void>(`/utilisateurs/${encodeURIComponent(id)}/mot-de-passe`, {
      method: 'PATCH',
      json: { nouveauMotDePasse },
      accessToken,
    }),
}

/* -------------------------------------------------------------------------- */
/* Réunions, Ordre du jour, Résolutions (V1.1 §5)                            */
/* -------------------------------------------------------------------------- */

export type TypeReunion = 'ORDINAIRE' | 'EXTRAORDINAIRE'
export type StatutReunion = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'
export type StatutResolution = 'ADOPTEE' | 'REJETEE' | 'REPORTEE'

export interface PointOrdreDuJour {
  id: string
  reunionId: string
  titre: string
  ordre: number
  notes: string | null
  createdAt: string
}

export interface Resolution {
  id: string
  reunionId: string
  pointOrdreDuJourId: string | null
  texte: string
  statut: StatutResolution
  dateVote: string | null
  createdAt: string
  updatedAt: string
}

/** Ligne de liste GET /reunions (avec décompte points/résolutions). */
export interface ReunionListItem {
  id: string
  date: string
  lieu: string
  type: TypeReunion
  statut: StatutReunion
  compteRenduTexte: string | null
  createdAt: string
  updatedAt: string
  _count: { pointsOrdreDuJour: number; resolutions: number }
}

/** Détail GET /reunions/:id (points ordonnés + résolutions). */
export interface ReunionDetail {
  id: string
  date: string
  lieu: string
  type: TypeReunion
  statut: StatutReunion
  compteRenduTexte: string | null
  createdAt: string
  updatedAt: string
  pointsOrdreDuJour: PointOrdreDuJour[]
  resolutions: Resolution[]
}

export interface PointInput {
  titre: string
  notes?: string
}

export interface ReunionCreateInput {
  date: string
  lieu: string
  type?: TypeReunion
  statut?: StatutReunion
  compteRenduTexte?: string
  pointsOrdreDuJour?: PointInput[]
}

export interface ReunionUpdateInput {
  date?: string
  lieu?: string
  type?: TypeReunion
  statut?: StatutReunion
  compteRenduTexte?: string | null
}

export interface ResolutionCreateInput {
  texte: string
  statut?: StatutResolution
  dateVote?: string
  pointOrdreDuJourId?: string
}

export interface ResolutionUpdateInput {
  texte?: string
  statut?: StatutResolution
  dateVote?: string | null
  pointOrdreDuJourId?: string | null
}

const rid = (id: string) => encodeURIComponent(id)

export const reunionsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<ReunionListItem[]>('/reunions', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<ReunionDetail>(`/reunions/${rid(id)}`, { accessToken, signal }),
  create: (body: ReunionCreateInput, accessToken: string) =>
    request<ReunionDetail>('/reunions', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: ReunionUpdateInput, accessToken: string) =>
    request<ReunionDetail>(`/reunions/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/reunions/${rid(id)}`, { method: 'DELETE', accessToken }),
  addPoint: (reunionId: string, body: PointInput, accessToken: string) =>
    request<PointOrdreDuJour>(`/reunions/${rid(reunionId)}/points`, {
      method: 'POST',
      json: body,
      accessToken,
    }),
  updatePoint: (
    reunionId: string,
    pointId: string,
    body: { titre?: string; notes?: string | null },
    accessToken: string,
  ) =>
    request<PointOrdreDuJour>(`/reunions/${rid(reunionId)}/points/${rid(pointId)}`, {
      method: 'PATCH',
      json: body,
      accessToken,
    }),
  removePoint: (reunionId: string, pointId: string, accessToken: string) =>
    request<void>(`/reunions/${rid(reunionId)}/points/${rid(pointId)}`, {
      method: 'DELETE',
      accessToken,
    }),
  reorderPoints: (reunionId: string, ordreIds: string[], accessToken: string) =>
    request<ReunionDetail>(`/reunions/${rid(reunionId)}/points/ordre`, {
      method: 'PUT',
      json: { ordreIds },
      accessToken,
    }),
}

export const resolutionsApi = {
  listByReunion: (reunionId: string, accessToken: string, signal?: AbortSignal) =>
    request<Resolution[]>(`/reunions/${rid(reunionId)}/resolutions`, { accessToken, signal }),
  create: (reunionId: string, body: ResolutionCreateInput, accessToken: string) =>
    request<Resolution>(`/reunions/${rid(reunionId)}/resolutions`, {
      method: 'POST',
      json: body,
      accessToken,
    }),
  update: (id: string, body: ResolutionUpdateInput, accessToken: string) =>
    request<Resolution>(`/resolutions/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/resolutions/${rid(id)}`, { method: 'DELETE', accessToken }),
}

/* Fonctions/organes + historique des nominations (V1.1 §5) -------------------- */

/** Membre exposé avec une affectation (titulaire). */
export interface AffectationMembre {
  id: string
  nom: string
  prenom: string
}

/** Fonction exposée avec une affectation (référence légère). */
export interface AffectationFonctionRef {
  id: string
  nom: string
  description: string | null
}

/** Une nomination (affectation). `dateFin === null` ⇒ titulaire en cours. */
export interface Affectation {
  id: string
  fonctionId: string
  membreId: string
  dateDebut: string
  dateFin: string | null
  notes: string | null
  createdAt: string
  membre?: AffectationMembre // inclus selon l'endpoint
  fonction?: AffectationFonctionRef // inclus selon l'endpoint
}

/** Ligne de liste GET /fonctions : titulaire actuel (0 ou 1) + taille d'historique. */
export interface FonctionListItem {
  id: string
  nom: string
  description: string | null
  createdAt: string
  affectations: Affectation[]
  _count: { affectations: number }
}

/** Détail GET /fonctions/:id : historique complet (plus récentes d'abord). */
export interface FonctionDetail {
  id: string
  nom: string
  description: string | null
  createdAt: string
  affectations: Affectation[]
}

/** Fonction « nue » renvoyée par create/update (sans include). */
export interface Fonction {
  id: string
  nom: string
  description: string | null
  createdAt: string
}

export interface FonctionInput {
  nom: string
  description?: string
}

export interface FonctionUpdateInput {
  nom?: string
  description?: string | null
}

export interface AffectationCreateInput {
  fonctionId: string
  membreId: string
  dateDebut: string
  notes?: string
}

export const fonctionsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<FonctionListItem[]>('/fonctions', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<FonctionDetail>(`/fonctions/${rid(id)}`, { accessToken, signal }),
  create: (body: FonctionInput, accessToken: string) =>
    request<Fonction>('/fonctions', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: FonctionUpdateInput, accessToken: string) =>
    request<Fonction>(`/fonctions/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/fonctions/${rid(id)}`, { method: 'DELETE', accessToken }),
  historique: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Affectation[]>(`/fonctions/${rid(id)}/affectations`, { accessToken, signal }),
}

export const affectationsApi = {
  create: (body: AffectationCreateInput, accessToken: string) =>
    request<Affectation>('/affectations', { method: 'POST', json: body, accessToken }),
  actives: (accessToken: string, signal?: AbortSignal) =>
    request<Affectation[]>('/affectations/actives', { accessToken, signal }),
  parMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Affectation[]>(`/membres/${rid(membreId)}/affectations`, { accessToken, signal }),
}

/* Conflits familiaux (V2 §4.4) — module sensible ----------------------------- */

export type NiveauConfidentialite = 'PUBLIC' | 'BUREAU' | 'CONFIDENTIEL'
export type StatutConflit = 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'CLOS'

/** Référence légère d'un compte (auteur / responsable), champs sûrs uniquement. */
export interface ConflitUtilisateurRef {
  id: string
  email: string
  role: string
}

export interface ConflitMembreRef {
  id: string
  nom: string
  prenom: string
}

/**
 * Conflit tel que renvoyé par l'API. La visibilité est déjà filtrée côté serveur :
 * le front ne reçoit JAMAIS un conflit hors périmètre du demandeur.
 */
export interface Conflit {
  id: string
  titre: string
  description: string
  niveauConfidentialite: NiveauConfidentialite
  statut: StatutConflit
  auteurId: string
  responsableSuiviId: string | null
  dateOuverture: string
  dateResolution: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  auteur: ConflitUtilisateurRef | null
  responsableSuivi: ConflitUtilisateurRef | null
  membresConcernes: ConflitMembreRef[]
}

export interface ConflitCreateInput {
  titre: string
  description: string
  niveauConfidentialite: NiveauConfidentialite
  /** Pertinent seulement si niveauConfidentialite = CONFIDENTIEL. */
  responsableSuiviId?: string
  membresConcernes?: string[]
  notes?: string
}

export interface ConflitUpdateInput {
  statut?: StatutConflit
  notes?: string | null
}

export const conflitsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Conflit[]>('/conflits', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Conflit>(`/conflits/${rid(id)}`, { accessToken, signal }),
  create: (body: ConflitCreateInput, accessToken: string) =>
    request<Conflit>('/conflits', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: ConflitUpdateInput, accessToken: string) =>
    request<Conflit>(`/conflits/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  /** Comptes désignables comme responsable de suivi (réservé aux déclarants). */
  responsables: (accessToken: string, signal?: AbortSignal) =>
    request<ConflitUtilisateurRef[]>('/conflits/responsables', { accessToken, signal }),
}

/* Commémorations / cérémonies (V2) ------------------------------------------- */

export type TypeCommemoration = 'COMMEMORATION' | 'CEREMONIE'
export type StatutCommemoration = 'PLANIFIEE' | 'TENUE' | 'ANNULEE'

export interface CommemorationMembreRef {
  id: string
  nom: string
  prenom: string
}

export interface Commemoration {
  id: string
  titre: string
  type: TypeCommemoration
  date: string
  lieu: string | null
  description: string | null
  statut: StatutCommemoration
  notes: string | null
  createdAt: string
  updatedAt: string
  membresConcernes: CommemorationMembreRef[]
}

export interface CommemorationInput {
  titre: string
  date: string
  type?: TypeCommemoration
  lieu?: string
  description?: string
  statut?: StatutCommemoration
  notes?: string
  membresConcernes?: string[]
}

export interface CommemorationUpdateInput {
  titre?: string
  type?: TypeCommemoration
  date?: string
  lieu?: string | null
  description?: string | null
  statut?: StatutCommemoration
  notes?: string | null
  membresConcernes?: string[]
}

export const commemorationsApi = {
  list: (accessToken: string, signal?: AbortSignal) =>
    request<Commemoration[]>('/commemorations', { accessToken, signal }),
  get: (id: string, accessToken: string, signal?: AbortSignal) =>
    request<Commemoration>(`/commemorations/${rid(id)}`, { accessToken, signal }),
  create: (body: CommemorationInput, accessToken: string) =>
    request<Commemoration>('/commemorations', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: CommemorationUpdateInput, accessToken: string) =>
    request<Commemoration>(`/commemorations/${rid(id)}`, { method: 'PATCH', json: body, accessToken }),
  remove: (id: string, accessToken: string) =>
    request<void>(`/commemorations/${rid(id)}`, { method: 'DELETE', accessToken }),
  /** Membres sélectionnables comme concernés/honorés (réservé aux gestionnaires). */
  membres: (accessToken: string, signal?: AbortSignal) =>
    request<CommemorationMembreRef[]>('/commemorations/membres', { accessToken, signal }),
}

/* Documents / archives (V2 §5) ----------------------------------------------- */

export type EntiteDocument = 'MEMBRE' | 'REUNION' | 'CONFLIT' | 'COMMEMORATION'

/** Métadonnées d'un document (l'URL brute du blob n'est JAMAIS exposée par l'API). */
export interface DocumentMeta {
  id: string
  nom: string
  description: string | null
  typeFichier: string
  tailleOctets: number
  entiteType: EntiteDocument
  entiteId: string
  dateTeleversement: string
  createdAt: string
  televersePar: { id: string; email: string; role: string } | null
}

export interface DocumentUploadInput {
  entiteType: EntiteDocument
  entiteId: string
  nom: string
  description?: string
  file: File
}

/** Extrait un message d'erreur d'une réponse fetch non-ok et lève une ApiError. */
async function leverSiErreur(res: Response): Promise<void> {
  if (res.ok) return
  let message = `Erreur ${res.status}`
  try {
    const data = (await res.json()) as { message?: string }
    if (data?.message) message = data.message
  } catch {
    /* pas de corps JSON */
  }
  throw new ApiError(res.status, message)
}

export const documentsApi = {
  listByEntite: (
    entiteType: EntiteDocument,
    entiteId: string,
    accessToken: string,
    signal?: AbortSignal,
  ) =>
    request<DocumentMeta[]>(
      `/documents?entiteType=${entiteType}&entiteId=${rid(entiteId)}`,
      { accessToken, signal },
    ),

  remove: (id: string, accessToken: string) =>
    request<void>(`/documents/${rid(id)}`, { method: 'DELETE', accessToken }),

  /** Upload multipart. On laisse le navigateur poser le Content-Type (+ boundary). */
  upload: async (input: DocumentUploadInput, accessToken: string): Promise<DocumentMeta> => {
    const fd = new FormData()
    fd.append('entiteType', input.entiteType)
    fd.append('entiteId', input.entiteId)
    fd.append('nom', input.nom)
    if (input.description) fd.append('description', input.description)
    fd.append('fichier', input.file)
    const res = await fetch(`${API_URL}/documents`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: fd,
    })
    await leverSiErreur(res)
    return (await res.json()) as DocumentMeta
  },

  /**
   * Télécharge le contenu via le proxy authentifié (l'URL blob n'est jamais exposée).
   * Renvoie un Blob ; l'appelant crée une object-URL pour l'afficher / le télécharger.
   */
  telecharger: async (id: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/documents/${rid(id)}/contenu`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
}

/* Journal d'audit (V2 §5) — consultation ADMIN --------------------------------- */

export type ActionAudit = 'CREATE' | 'UPDATE' | 'DELETE'

export interface AuditEntry {
  id: string
  entiteType: string
  entiteId: string
  action: ActionAudit
  acteurId: string | null
  donneesAvant: Record<string, unknown> | null
  donneesApres: Record<string, unknown> | null
  dateAction: string
  acteur: { id: string; email: string; role: string } | null
}

export interface AuditPage {
  donnees: AuditEntry[]
  page: number
  limite: number
  total: number
}

export interface AuditFiltres {
  entiteType?: string
  entiteId?: string
  acteurId?: string
  dateDebut?: string
  dateFin?: string
  page?: number
  limite?: number
}

export const auditLogApi = {
  list: (filtres: AuditFiltres, accessToken: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams()
    for (const [cle, valeur] of Object.entries(filtres)) {
      if (valeur !== undefined && valeur !== '') qs.append(cle, String(valeur))
    }
    const suffixe = qs.toString() ? `?${qs.toString()}` : ''
    return request<AuditPage>(`/audit-log${suffixe}`, { accessToken, signal })
  },
}
