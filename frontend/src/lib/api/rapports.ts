import { API_URL, ApiError, nomFichierDepuisDisposition, request } from './core'
import type { RepartitionStatutContribution, StatutContribution } from './types'

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
