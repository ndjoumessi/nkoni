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
}
