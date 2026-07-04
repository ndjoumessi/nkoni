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
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
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

interface RequestOptions {
  method?: string
  json?: unknown
  accessToken?: string | null
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, accessToken, signal } = options

  const headers: Record<string, string> = {}
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
    signal,
  })

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
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password },
    }),
  refresh: (signal?: AbortSignal) =>
    request<RefreshResponse>('/auth/refresh', { method: 'POST', signal }),
  me: (accessToken: string, signal?: AbortSignal) =>
    request<AuthUser>('/auth/me', { accessToken, signal }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
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

export interface DashboardComplet {
  vue: 'COMPLET'
  anneeCourante: number
  finances: Finances
  membresParStatutContribution: RepartitionStatutContribution
  membresParStatutMembre: RepartitionStatutMembre
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
  create: (body: MembreInput, accessToken: string) =>
    request<Membre>('/membres', { method: 'POST', json: body, accessToken }),
  update: (id: string, body: Partial<MembreInput>, accessToken: string) =>
    request<Membre>(`/membres/${id}`, { method: 'PATCH', json: body, accessToken }),
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
}

export const versementsApi = {
  listByContribution: (contributionId: string, accessToken: string, signal?: AbortSignal) =>
    request<Versement[]>(
      `/versements?contributionId=${encodeURIComponent(contributionId)}`,
      { accessToken, signal },
    ),
  create: (body: VersementInput, accessToken: string) =>
    request<VersementCree>('/versements', { method: 'POST', json: body, accessToken }),
}

export const recusApi = {
  listByMembre: (membreId: string, accessToken: string, signal?: AbortSignal) =>
    request<Recu[]>(`/recus?membreId=${encodeURIComponent(membreId)}`, { accessToken, signal }),
  generer: (versementId: string, accessToken: string) =>
    request<Recu>(`/versements/${encodeURIComponent(versementId)}/recu`, {
      method: 'POST',
      accessToken,
    }),
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
}
