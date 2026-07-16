import { request } from './core'

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
