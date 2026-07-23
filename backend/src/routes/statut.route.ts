import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireSuperAdmin } from '../middlewares/permissions'
import { lireIncident, definirIncident, type GraviteIncident } from '../services/statut-incident.service'

const GRAVITES: GraviteIncident[] = ['INFO', 'MAINTENANCE', 'INCIDENT']

/**
 * Bannière d'incident de la page de statut publique (§2.2/§8).
 *
 *   GET /statut/incident          → PUBLIC (non authentifié) : l'incident courant s'il est ACTIF,
 *                                    sinon `{ actif: false }`. Le message n'est révélé que s'il est
 *                                    publié — rien à divulguer quand aucune bannière n'est active.
 *   PUT /platform/statut/incident → SUPER_ADMIN : définit / met à jour la bannière (upsert unique).
 *
 * `StatutIncident` est un modèle PLATEFORME NON scopé → aucun `runUnscoped`, aucun contexte org
 * (l'extension d'isolation le laisse passer). Un incident concerne tout le service, pas un tenant.
 */
export const statutRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/statut/incident', async () => {
    const inc = await lireIncident(app.prisma)
    if (!inc || !inc.actif) return { actif: false }
    return { actif: true, gravite: inc.gravite, message: inc.message, updatedAt: inc.updatedAt }
  })

  // GET super-admin : état COMPLET (message inclus même si inactif) pour pré-remplir l'éditeur —
  // le GET public masque le message tant que la bannière n'est pas publiée.
  app.get(
    '/platform/statut/incident',
    { preHandler: [authenticate, requireSuperAdmin] },
    async () => {
      const inc = await lireIncident(app.prisma)
      return inc ?? { actif: false, gravite: 'INFO' as GraviteIncident, message: '' }
    },
  )

  app.put<{ Body: { actif: boolean; gravite: GraviteIncident; message: string } }>(
    '/platform/statut/incident',
    {
      preHandler: [authenticate, requireSuperAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['actif', 'gravite', 'message'],
          additionalProperties: false,
          properties: {
            actif: { type: 'boolean' },
            gravite: { type: 'string', enum: GRAVITES },
            // Message TOUJOURS requis (on le rédige, puis on bascule `actif`) ; borné pour un bandeau.
            message: { type: 'string', minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (req) => {
      return definirIncident(app.prisma, {
        actif: req.body.actif,
        gravite: req.body.gravite,
        message: req.body.message.trim(),
      })
    },
  )
}

export default statutRoutes
