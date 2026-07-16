import { request } from './core'

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
