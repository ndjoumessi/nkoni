import type { Forfait } from '@/lib/forfait'
import { API_URL, leverSiErreur, request } from './core'

/**
 * Paramètres de l'organisation COURANTE (§5) — vue lecture seule (nom/devise/langue immuables)
 * + volume de membres face à la limite du forfait gratuit. Accessible au bureau (pas MEMBRE_SIMPLE).
 */
export interface OrganisationCourante {
  id: string
  nom: string
  devise: 'FCFA' | 'EUR' | 'USD' | 'CAD'
  langueDefaut: 'FR' | 'EN'
  forfait: Forfait
  createdAt: string
  nbMembres: number
  /** Plafond du forfait — `null` = illimité (Pro/Entreprise). */
  limiteMembres: number | null
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

export type PspProvider = 'FAPSHI' | 'CAMPAY'
export type EnvironnementPsp = 'SANDBOX' | 'LIVE'

/** Vue SÛRE de la config de paiement (jamais le secret) — GET /organisations/moi/paiement. */
export interface ConfigPaiement {
  configure: boolean
  provider: PspProvider | null
  environnement: EnvironnementPsp | null
  /** Identifiant PUBLIC du compte PSP (username CamPay / apiUser Fapshi) — pour l'affichage, jamais le secret. */
  identifiantPublic: string | null
  /** Dernière mise à jour de la config (ISO) — retour visuel de confirmation. */
  misAJourLe: string | null
  actif: boolean
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
  /**
   * EXPORT self-service des données de l'organisation (portabilité RGPD, ADMIN/PRESIDENT). Renvoie
   * le JSON en Blob — le proxy authentifié pose l'en-tête de téléchargement côté serveur, mais pour
   * un Blob c'est l'appelant qui nomme le fichier à l'enregistrement.
   */
  telechargerExport: async (accessToken: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/organisations/moi/export`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    await leverSiErreur(res)
    return res.blob()
  },
  /** Config de paiement en ligne de l'org (jamais le secret). ADMIN/PRESIDENT. */
  configPaiement: (accessToken: string, signal?: AbortSignal) =>
    request<ConfigPaiement>('/organisations/moi/paiement', { accessToken, signal }),
  /** Enregistre (crée/remplace) la config de paiement — les identifiants sont chiffrés côté serveur. */
  enregistrerConfigPaiement: (
    input: { provider: PspProvider; identifiants: Record<string, string>; actif: boolean },
    accessToken: string,
  ) =>
    request<ConfigPaiement>('/organisations/moi/paiement', {
      method: 'PUT',
      json: input,
      accessToken,
    }),
}
