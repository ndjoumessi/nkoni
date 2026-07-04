import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import {
  listerUtilisateurs,
  creerUtilisateur,
  majUtilisateur,
  EmailDejaUtiliseError,
  MembreIntrouvableError,
  MembreDejaLieError,
  UtilisateurIntrouvableError,
} from '../services/utilisateur.service'
import type { Role } from '../middlewares/permissions'

/**
 * Gestion des comptes Utilisateur (§4.5) — RÉSERVÉ ADMIN.
 *
 * Matrice §2 : seul ADMIN a le CRUD complet sur Utilisateur. Le couple read/update
 * accordé à MEMBRE_SIMPLE ne concerne QUE son propre profil (hors de cette surface),
 * on ne peut donc pas se contenter de `requirePermission('Utilisateur', 'read')` ici :
 * on gate explicitement sur le rôle ADMIN.
 *
 *   GET   /utilisateurs      → liste (sans passwordHash)
 *   POST  /utilisateurs      → création (email, mot de passe, rôle, membreId?)
 *   PATCH /utilisateurs/:id  → rôle / activation (désactivation douce, pas de delete dur)
 */

const ROLE_ENUM: readonly Role[] = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'GUIDE_RELIGIEUX',
  'MEMBRE_SIMPLE',
]

interface CreateBody {
  email: string
  password: string
  role: Role
  membreId?: string
}
interface UpdateBody {
  role?: Role
  actif?: boolean
}

const createSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'role'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
      role: { type: 'string', enum: ROLE_ENUM },
      membreId: { type: 'string' },
    },
  },
} as const

const updateSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      role: { type: 'string', enum: ROLE_ENUM },
      actif: { type: 'boolean' },
    },
  },
} as const

/** Gate ADMIN explicite pour toute la surface de gestion des comptes. */
const requireAdmin: preHandlerHookHandler = async (req, reply) => {
  if (req.user.role !== 'ADMIN') {
    reply.code(403).send({
      error: 'Forbidden',
      message: "La gestion des comptes est réservée à l'administrateur.",
    })
  }
}

/** Mappe les erreurs métier du service en réponses 4xx explicites ; relance le reste. */
function reply4xxSiMetier(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof EmailDejaUtiliseError || err instanceof MembreDejaLieError) {
    reply.code(409).send({ error: 'Conflict', message: err.message })
    return true
  }
  if (err instanceof MembreIntrouvableError) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
    return true
  }
  if (err instanceof UtilisateurIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
    return true
  }
  return false
}

export const utilisateursRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /utilisateurs — ADMIN.
  app.get(
    '/utilisateurs',
    { preHandler: [authenticate, requireAdmin] },
    async () => listerUtilisateurs(app.prisma),
  )

  // POST /utilisateurs — ADMIN.
  app.post<{ Body: CreateBody }>(
    '/utilisateurs',
    { schema: createSchema, preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      try {
        const { email, password, role, membreId } = req.body
        const cree = await creerUtilisateur(app.prisma, {
          email,
          password,
          role,
          ...(membreId !== undefined ? { membreId } : {}),
        })
        return reply.code(201).send(cree)
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )

  // PATCH /utilisateurs/:id — ADMIN. Rôle / activation (désactivation douce).
  app.patch<{ Params: { id: string }; Body: UpdateBody }>(
    '/utilisateurs/:id',
    { schema: updateSchema, preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { role, actif } = req.body

      // Garde-fou anti auto-verrouillage : un ADMIN ne peut ni se désactiver ni se
      // rétrograder lui-même (sinon plus aucun administrateur possible).
      if (req.params.id === req.user.sub && (actif === false || (role && role !== 'ADMIN'))) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Vous ne pouvez pas désactiver ni rétrograder votre propre compte.',
        })
      }

      try {
        return await majUtilisateur(app.prisma, req.params.id, {
          ...(role !== undefined ? { role } : {}),
          ...(actif !== undefined ? { actif } : {}),
        })
      } catch (err) {
        if (reply4xxSiMetier(err, reply)) return
        throw err
      }
    },
  )
}

export default utilisateursRoutes
