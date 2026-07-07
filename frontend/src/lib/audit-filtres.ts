import type { AuditFiltres } from './api'

/** État des filtres du journal d'audit (miroir des `useState` de la page). */
export interface EtatFiltresAudit {
  page: number
  entiteType?: string
  acteurId?: string
  /** Date ISO `yyyy-mm-dd` (borne basse, incluse). */
  dateDebut?: string
  /** Date ISO `yyyy-mm-dd` (borne haute, incluse). */
  dateFin?: string
}

/**
 * Construit les paramètres de requête du journal d'audit à partir de l'état des filtres.
 *
 * Les bornes de date sont étendues à la JOURNÉE ENTIÈRE (« Du » → 00:00:00, « Au » → 23:59:59)
 * pour que les deux bornes soient INCLUSIVES côté serveur (comparaison `gte`/`lte` sur
 * `dateAction`). Sans cette extension, « Au = 2026-03-31 » exclurait toutes les écritures du
 * 31 mars (comparées à minuit). Les champs vides sont omis (pas de clé dans la query string).
 */
export function construireFiltresAudit(etat: EtatFiltresAudit): AuditFiltres {
  return {
    page: etat.page,
    ...(etat.entiteType ? { entiteType: etat.entiteType } : {}),
    ...(etat.acteurId ? { acteurId: etat.acteurId } : {}),
    ...(etat.dateDebut ? { dateDebut: `${etat.dateDebut}T00:00:00` } : {}),
    ...(etat.dateFin ? { dateFin: `${etat.dateFin}T23:59:59` } : {}),
  }
}
