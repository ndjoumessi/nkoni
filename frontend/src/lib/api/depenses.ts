import { request, rid } from './core'
import type { Paginated } from './types'

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

/**
 * Query string des dépenses. `pagination` n'est ajoutée QUE pour la liste — l'endpoint /tresorerie
 * (solde), qui partage ce helper, refuse les paramètres inconnus (`additionalProperties: false`).
 */
function qsDepenses(f: FiltreDepenses = {}, pagination?: { page?: number; pageSize?: number }): string {
  const p = new URLSearchParams()
  if (f.statut) p.set('statut', f.statut)
  if (f.categorie) p.set('categorie', f.categorie)
  if (f.dateDebut) p.set('dateDebut', f.dateDebut)
  if (f.dateFin) p.set('dateFin', f.dateFin)
  if (pagination?.page) p.set('page', String(pagination.page))
  if (pagination?.pageSize) p.set('pageSize', String(pagination.pageSize))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const depensesApi = {
  solde: (filtre: FiltreDepenses, accessToken: string, signal?: AbortSignal) =>
    request<SoldeTresorerie>(`/tresorerie${qsDepenses(filtre)}`, { accessToken, signal }),
  list: (
    filtre: FiltreDepenses,
    pagination: { page?: number; pageSize?: number },
    accessToken: string,
    signal?: AbortSignal,
  ) =>
    request<Paginated<Depense>>(`/depenses${qsDepenses(filtre, pagination)}`, { accessToken, signal }),
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
