/**
 * Client HTTP de l'API NKONI — BARREL.
 *
 * Le monolithe historique a été découpé par domaine dans `./api/*` (Wave 17). Ce fichier
 * re-exporte l'intégralité de la surface publique pour que TOUS les imports existants
 * (`import { membresApi, ApiError, messageErreur, type Membre } from '@/lib/api'`) restent
 * inchangés. Ne rien ajouter ici : créer/enrichir le module de domaine concerné dans `./api/`.
 */

export * from './api/core'
export * from './api/types'
export * from './api/auth'
export * from './api/platform'
export * from './api/organisation'
export * from './api/dashboard'
export * from './api/notifications'
export * from './api/rapports'
export * from './api/membres'
export * from './api/branches'
export * from './api/moi'
export * from './api/bareme'
export * from './api/contributions'
export * from './api/versements'
export * from './api/recus'
export * from './api/depenses'
export * from './api/cagnottes'
export * from './api/amendes'
export * from './api/equilibrages'
export * from './api/utilisateurs'
export * from './api/reunions'
export * from './api/resolutions'
export * from './api/fonctions'
export * from './api/affectations'
export * from './api/conflits'
export * from './api/commemorations'
export * from './api/documents'
export * from './api/auditLog'
export * from './api/statut'
