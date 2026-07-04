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
  // `rememberMe` allonge la durée de la session (refresh 30 j au lieu de 7 j) côté back.
  // Le mot de passe n'est JAMAIS transmis pour être stocké : il ne sert qu'à cette requête.
  login: (email: string, password: string, rememberMe: boolean) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password, rememberMe },
    }),
  refresh: (signal?: AbortSignal) =>
    request<RefreshResponse>('/auth/refresh', { method: 'POST', signal }),
  me: (accessToken: string, signal?: AbortSignal) =>
    request<AuthUser>('/auth/me', { accessToken, signal }),
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
