import { API_URL, leverSiErreur, request, rid } from './core'
import type { StatutContribution } from './types'

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

/** Réponse BORNÉE de GET /membres/statuts (audit m4) : liste + total réel + drapeau de troncature. */
export interface StatutsMembres {
  items: MembreStatut[]
  total: number
  tronque: boolean
}

/** Compteurs de tête — sur l'ensemble NON filtré (§1.3). */
export interface ResumeStatuts {
  total: number
  actifs: number
  aJour: number
  nonAJour: number
  inactifs: number
}

/** Réponse PAGINÉE de GET /membres/statuts/page (§1.3) : page + total filtré + synthèse + branches. */
export interface StatutsMembresPagine {
  items: MembreStatut[]
  total: number
  page: number
  pageSize: number
  resume: ResumeStatuts
  branches: { id: string; nom: string }[]
}

/** Paramètres de la liste paginée (recherche + filtres + tri côté serveur). */
export interface OptionsListeStatuts {
  page?: number
  pageSize?: number
  recherche?: string
  branche?: string
  statut?: StatutMembre
  cotisation?: StatutContribution
  tri?: 'nom' | 'branche' | 'statut' | 'cotisation' | 'adhesion'
  dir?: 'asc' | 'desc'
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
  email: string | null
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
  email?: string
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
  /**
   * Réponse BORNÉE serveur `{ items, total, tronque }` (audit m4 : plus de liste non paginée).
   * Utile quand l'appelant a besoin du signal de troncature (page Membres principale).
   */
  listStatutsPage: (accessToken: string, signal?: AbortSignal) =>
    request<StatutsMembres>('/membres/statuts', { accessToken, signal }),
  /**
   * Variante « tableau seul » : déballe `.items` pour les nombreux appelants (sélecteurs,
   * dashboard, ⌘K…) qui n'exploitent pas la troncature. La borne serveur (1000) s'applique
   * quand même — largement au-delà des besoins de ces vues.
   */
  listStatuts: (accessToken: string, signal?: AbortSignal) =>
    request<StatutsMembres>('/membres/statuts', { accessToken, signal }).then((r) => r.items),
  /**
   * Liste PAGINÉE (§1.3) — recherche, filtres et tri côté SERVEUR, page bornée. Renvoie aussi la
   * synthèse et les branches (sur l'ensemble non filtré). Pour la page Membres des grosses orgs.
   */
  listStatutsPagine: (opts: OptionsListeStatuts, accessToken: string, signal?: AbortSignal) => {
    const p = new URLSearchParams()
    if (opts.page) p.set('page', String(opts.page))
    if (opts.pageSize) p.set('pageSize', String(opts.pageSize))
    if (opts.recherche) p.set('recherche', opts.recherche)
    if (opts.branche) p.set('branche', opts.branche)
    if (opts.statut) p.set('statut', opts.statut)
    if (opts.cotisation) p.set('cotisation', opts.cotisation)
    if (opts.tri) p.set('tri', opts.tri)
    if (opts.dir) p.set('dir', opts.dir)
    const qs = p.toString()
    return request<StatutsMembresPagine>(`/membres/statuts/page${qs ? `?${qs}` : ''}`, {
      accessToken,
      signal,
    })
  },
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
  /** Télécharge le RELEVÉ DE COMPTE du membre (PDF « relevé bancaire » des cotisations). */
  telechargerReleve: async (id: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/membres/${rid(id)}/releve`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Récupère la PHOTO du membre (Blob privé, proxy authentifié). Rejette (404) si aucune photo. */
  chargerPhoto: async (id: string, accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/membres/${rid(id)}/photo`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Téléverse la photo du membre (JPEG/PNG, éventuellement recadrée → Blob). NE PAS fixer Content-Type. */
  uploadPhoto: async (id: string, fichier: Blob, accessToken: string): Promise<void> => {
    const form = new FormData()
    form.append('photo', fichier, 'photo.jpg')
    const res = await fetch(`${API_URL}/membres/${rid(id)}/photo`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    })
    await leverSiErreur(res)
  },
  /** Supprime la photo du membre. */
  supprimerPhoto: (id: string, accessToken: string) =>
    request<void>(`/membres/${rid(id)}/photo`, { method: 'DELETE', accessToken }),
  /** Parsing SERVEUR du fichier d'import (.xlsx/.csv) → lignes brutes (le parseur quitte le
   *  navigateur, audit m6). NE PAS fixer Content-Type (le navigateur pose le boundary multipart). */
  parserFichier: async (
    fichier: File,
    accessToken: string,
  ): Promise<{ entetes: string[]; lignes: string[][] }> => {
    const form = new FormData()
    form.append('fichier', fichier)
    const res = await fetch(`${API_URL}/membres/import/fichier`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    })
    await leverSiErreur(res)
    return res.json()
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
