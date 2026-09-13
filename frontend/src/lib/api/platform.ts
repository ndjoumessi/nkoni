import type { EtatForfait, Forfait, PeriodeProlongation } from '@/lib/forfait'
import { request } from './core'

/**
 * Champs d'échéance CALCULÉS par le serveur (spec 1.1 §2.3) — dates ISO, fins de journée à Douala :
 * les afficher avec `formatDateApp`, jamais `formatDate` (fuseau du poste → décalage d'un jour).
 */
export interface EcheanceForfait {
  forfaitExpireLe: string | null
  etatForfait: EtatForfait
  /** `null` si `SANS_ECHEANCE`. */
  joursRestants: number | null
  /** Fin de la période de grâce ; `null` si `SANS_ECHEANCE`. */
  finGraceLe: string | null
  /** Forfait dont les capacités s'appliquent (GRATUIT après la grâce). */
  forfaitEffectif: Forfait
}

/**
 * Rôle plateforme SUPER_ADMIN (SaaS §2.3) — vue d'une organisation cliente.
 * Aucune donnée métier : uniquement statut, date de création et volume (nb membres).
 */
export interface PlatformOrganisation extends EcheanceForfait {
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

/** Réponse de la prolongation (aperçu ou écriture) — POST /platform/organisations/:id/forfait/prolonger. */
export interface ApercuProlongation {
  organisation: OrganisationStatut
  echeanceActuelle: string | null
  nouvelleEcheance: string
  etatApres: EtatForfait
  joursRestantsApres: number
}

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
   * Prolonge l'échéance du forfait (SUPER_ADMIN). `apercu: true` → nouvelle date calculée SANS écriture
   * (la console affiche exactement ce que l'écriture produira). Hors aperçu, `attendu` est OBLIGATOIRE
   * (imposé par le serveur, B1) : ce sont les valeurs `echeanceActuelle`/`nouvelleEcheance` que l'aperçu
   * a montrées — l'écriture ne fait que les confirmer, elle ne relit rien de son côté. 409 si GRATUIT,
   * échéance modifiée depuis l'aperçu, ou valeurs attendues périmées.
   */
  prolongerForfait: (
    id: string,
    mois: PeriodeProlongation,
    apercu: boolean,
    accessToken: string,
    attendu?: { echeanceAttendue: string | null; nouvelleEcheanceAttendue: string },
  ) =>
    request<ApercuProlongation>(`/platform/organisations/${id}/forfait/prolonger`, {
      method: 'POST',
      accessToken,
      json: { mois, apercu, ...(apercu ? {} : attendu) },
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
  /**
   * Journal d'audit PLATEFORME (vue « Historique », lecture seule). Filtrable par action et par
   * organisation ciblée ; réponse BORNÉE (`tronque` signale un dépassement de la limite serveur).
   */
  listAudit: (
    filtres: { action?: ActionPlateforme; organisationCibleId?: string },
    accessToken: string,
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams()
    if (filtres.action) qs.set('action', filtres.action)
    if (filtres.organisationCibleId) qs.set('organisationCibleId', filtres.organisationCibleId)
    const suffixe = qs.toString() ? `?${qs.toString()}` : ''
    return request<PlatformAuditPage>(`/platform/audit-log${suffixe}`, { accessToken, signal })
  },
}

/** Actions plateforme journalisées (miroir de l'enum Prisma `ActionPlateforme`). */
export type ActionPlateforme =
  | 'CHANGER_FORFAIT'
  | 'PROLONGER_FORFAIT'
  | 'SUSPENDRE'
  | 'REACTIVER'
  | 'PURGER'
  | 'EXPORTER'

/** Une entrée du journal d'audit plateforme (SUPER_ADMIN). Snapshots figés à l'action. */
export interface PlatformAuditEntry {
  id: string
  acteurId: string
  acteurEmail: string
  action: ActionPlateforme
  organisationCibleId: string
  organisationNom: string
  donneesAvant: unknown
  donneesApres: unknown
  dateAction: string
}

export interface PlatformAuditPage {
  items: PlatformAuditEntry[]
  total: number
  /** `true` si le total dépasse la limite serveur : la vue affiche une bannière de troncature. */
  tronque: boolean
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
