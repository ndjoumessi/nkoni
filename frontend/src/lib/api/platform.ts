import type { Forfait } from '@/lib/forfait'
import { request } from './core'

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
  forfait: Forfait
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
  /** Attribue un forfait à une organisation (SUPER_ADMIN, activation manuelle §3.1). */
  changerForfait: (id: string, forfait: Forfait, accessToken: string) =>
    request<{ organisation: OrganisationStatut }>(`/platform/organisations/${id}/forfait`, {
      method: 'PATCH',
      accessToken,
      json: { forfait },
    }),
  /**
   * Export COMPLET des données d'une organisation (bloquant GA 0.3). Lecture seule et idempotent.
   * Renvoie l'objet brut — l'appelant le sérialise pour le téléchargement.
   */
  exporter: (id: string, accessToken: string) =>
    request<ExportOrganisation>(`/platform/organisations/${id}/export`, { accessToken }),
  /**
   * SUPPRESSION DÉFINITIVE d'une organisation. IRRÉVERSIBLE.
   *
   * Le backend impose un DOUBLE VERROU : organisation déjà suspendue (409 sinon) et
   * `confirmationNom` égal EXACTEMENT au nom (400 sinon). L'UI reproduit les deux — mais c'est
   * bien le serveur qui garde, l'UI ne fait qu'éviter un aller-retour perdu.
   */
  supprimer: (id: string, confirmationNom: string, accessToken: string) =>
    request<ResultatSuppression>(`/platform/organisations/${id}`, {
      method: 'DELETE',
      accessToken,
      json: { confirmationNom },
    }),
}

/** Pièce jointe référencée par l'export (photos, reçus PDF, documents). */
export interface FichierExporte {
  modele: 'Membre' | 'Recu' | 'Document'
  id: string
  champ: string
  url: string
  mime?: string | null
}

export interface ExportOrganisation {
  version: 1
  genereLe: string
  organisation: Record<string, unknown> | null
  donnees: Record<string, unknown[]>
  compteurs: Record<string, number>
  fichiers: FichierExporte[]
}

export interface ResultatSuppression {
  supprimee: boolean
  compteurs: Record<string, number>
  blobs: { supprimes: number; echecs: string[] }
  export: ExportOrganisation
}
