import type {
  FastifyInstance,
  FastifyPluginAsync,
  preHandlerHookHandler,
} from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import {
  listerUtilisateurs,
  creerUtilisateur,
  majUtilisateur,
  reinitialiserMotDePasse,
} from '../services/utilisateur.service'
import type { Role } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'

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

const resetPasswordSchema = {
  body: {
    type: 'object',
    required: ['nouveauMotDePasse'],
    additionalProperties: false,
    properties: {
      // minLength 8 aligné sur la création de compte.
      nouveauMotDePasse: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
} as const

/** Gate ADMIN explicite pour toute la surface de gestion des comptes. */
const requireAdmin: preHandlerHookHandler = async (req, reply) => {
  if (req.user.role !== 'ADMIN') {
    reply.code(403).send({
      error: 'Forbidden',
      message: t(langueDeRequete(req), 'utilisateurs.gestionReserveeAdmin'),
    })
  }
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
      const { email, password, role, membreId } = req.body
      const cree = await creerUtilisateur(app.prisma, {
        email,
        password,
        role,
        ...(membreId !== undefined ? { membreId } : {}),
      })
      return reply.code(201).send(cree)
    
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
          message: t(langueDeRequete(req), 'utilisateurs.autoVerrouillage'),
        })
      }

      return await majUtilisateur(app.prisma, req.params.id, {
        ...(role !== undefined ? { role } : {}),
        ...(actif !== undefined ? { actif } : {}),
      })
    
    },
  )

  // PATCH /utilisateurs/:id/mot-de-passe — ADMIN. Réinitialise le mot de passe d'un AUTRE
  // compte sans connaître l'ancien (dépannage). Le changement self-service avec ancien mot
  // de passe passe par POST /auth/changer-mot-de-passe.
  app.patch<{ Params: { id: string }; Body: { nouveauMotDePasse: string } }>(
    '/utilisateurs/:id/mot-de-passe',
    { schema: resetPasswordSchema, preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      await reinitialiserMotDePasse(app.prisma, req.params.id, req.body.nouveauMotDePasse)
      return reply.code(204).send()
    
    },
  )
}

export default utilisateursRoutes
