import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireSuperAdmin } from '../middlewares/permissions'
import { orgContext } from '../lib/org-context'
import { t, langueDeRequete } from '../lib/i18n'
import {
  listerOrganisations,
  definirStatutOrganisation,
} from '../services/organisation.service'

/**
 * Routes PLATEFORME (SaaS §2.3) — réservées au rôle transverse SUPER_ADMIN.
 *
 *   GET   /platform/organisations              → liste des organisations clientes
 *   POST  /platform/organisations/:id/suspendre → bloque l'accès (actif = false)
 *   POST  /platform/organisations/:id/reactiver → rétablit l'accès (actif = true)
 *
 * Toutes gardées par `authenticate` + `requireSuperAdmin`. Le super-admin n'ayant PAS de
 * contexte d'organisation (JWT sans claim organisationId), les accès à un modèle scopé
 * (Membre, pour le comptage) sont enveloppés dans `orgContext.runUnscoped` — bypass
 * délibéré et légitime de l'isolation, réservé à ce flux plateforme. Aucune donnée métier
 * (fiches membres, contributions…) n'est exposée : uniquement des métadonnées d'organisation.
 */
export const platformRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const garde = { preHandler: [authenticate, requireSuperAdmin] }

  // GET /platform/organisations — liste + statut + date + nombre de membres.
  app.get('/platform/organisations', garde, async () => {
    const organisations = await orgContext.runUnscoped(async () =>
      listerOrganisations(app.prisma),
    )
    return { organisations }
  })

  // POST /platform/organisations/:id/suspendre — bloque l'accès (§2.3, pas de suppression).
  app.post<{ Params: { id: string } }>(
    '/platform/organisations/:id/suspendre',
    garde,
    async (req, reply) => definirStatut(app, req.params.id, false, reply),
  )

  // POST /platform/organisations/:id/reactiver — rétablit l'accès.
  app.post<{ Params: { id: string } }>(
    '/platform/organisations/:id/reactiver',
    garde,
    async (req, reply) => definirStatut(app, req.params.id, true, reply),
  )
}

/**
 * Applique le changement de statut d'une organisation et gère le 404 (id inconnu → P2025).
 * Enveloppé dans `runUnscoped` par cohérence, bien qu'`Organisation` ne soit pas un modèle
 * scopé (défense en profondeur si la liste des modèles scopés évoluait).
 */
async function definirStatut(
  app: FastifyInstance,
  id: string,
  actif: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply: any,
): Promise<unknown> {
  try {
    const organisation = await orgContext.runUnscoped(async () =>
      definirStatutOrganisation(app.prisma, id, actif),
    )
    return { organisation }
  } catch (err) {
    // P2025 : id d'organisation inconnu → 404 (pas de fuite d'existence).
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2025') {
      return reply
        .code(404)
        .send({
          error: 'Not Found',
          message: t(langueDeRequete(reply.request), 'platform.organisationIntrouvable'),
        })
    }
    throw err
  }
}

export default platformRoutes
