import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import {
  listerFonctions,
  getFonction,
  creerFonction,
  majFonction,
  supprimerFonction,
  FonctionIntrouvableError,
  FonctionNomDuplicateError,
} from '../services/fonction.service'
import { listerHistorique } from '../services/affectation.service'

/**
 * V1.1 (§5) — Fonctions/organes familiaux.
 *
 * Permissions (matrice permissions.ts, entité `Fonction`) :
 *   - Lecture : ADMIN, PRESIDENT, SECRETAIRE, TRESORIERE, COMMISSAIRE_COMPTES, MEMBRE_SIMPLE
 *   - create/update : ADMIN, PRESIDENT, SECRETAIRE
 *   - delete : ADMIN, PRESIDENT
 * GUIDE_RELIGIEUX : aucun droit.
 *
 * L'historique des nominations d'une fonction est exposé ici en lecture
 * (GET /fonctions/:id/affectations) ; la création d'affectation est dans affectations.route.ts.
 */

const nomProp = { type: 'string', minLength: 1, maxLength: 200 } as const
const descriptionProp = { type: 'string', maxLength: 2000 } as const

const createFonctionSchema = {
  body: {
    type: 'object',
    required: ['nom'],
    additionalProperties: false,
    properties: { nom: nomProp, description: descriptionProp },
  },
} as const

const updateFonctionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      nom: nomProp,
      // nullable pour permettre d'effacer la description.
      description: { type: ['string', 'null'], maxLength: 2000 },
    },
  },
} as const

/** Mappe les erreurs métier du service en réponses 4xx ; renvoie true si traité. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof FonctionIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
    return true
  }
  if (err instanceof FonctionNomDuplicateError) {
    reply.code(409).send({ error: 'Conflict', message: err.message })
    return true
  }
  return false
}

export const fonctionsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Fonction', action)

  // GET /fonctions — liste (titulaire actuel + taille d'historique).
  app.get(
    '/fonctions',
    { preHandler: [authenticate, perm('read')] },
    async () => listerFonctions(app.prisma),
  )

  // GET /fonctions/:id — détail + historique complet des affectations.
  app.get<{ Params: { id: string } }>(
    '/fonctions/:id',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      try {
        return await getFonction(app.prisma, req.params.id)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // GET /fonctions/:id/affectations — historique des nominations de la fonction.
  app.get<{ Params: { id: string } }>(
    '/fonctions/:id/affectations',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      try {
        return await listerHistorique(app.prisma, req.params.id)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // POST /fonctions — création.
  app.post(
    '/fonctions',
    { schema: createFonctionSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cree = await creerFonction(app.prisma, req.body as any)
        return reply.code(201).send(cree)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PATCH /fonctions/:id — mise à jour (nom / description).
  app.patch<{ Params: { id: string } }>(
    '/fonctions/:id',
    { schema: updateFonctionSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await majFonction(app.prisma, req.params.id, req.body as any)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /fonctions/:id — suppression (cascade sur l'historique d'affectations).
  app.delete<{ Params: { id: string } }>(
    '/fonctions/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await supprimerFonction(app.prisma, req.params.id)
        return reply.code(204).send()
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default fonctionsRoutes
