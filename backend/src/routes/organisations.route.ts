import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { orgContext } from '../lib/org-context'
import { emettreSession } from '../lib/session'
import { t, langueDeRequete } from '../lib/i18n'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { langueEffective } from '../services/auth.service'
import {
  inscrireOrganisation,
  chargerOrganisationCourante,
  EmailDejaUtiliseError,
} from '../services/organisation.service'

/**
 * Organisation SaaS :
 *   POST /organisations/inscription → 201 { accessToken, user } + Set-Cookie refresh (§3.1)
 *   GET  /organisations/moi         → 200 paramètres de l'organisation courante (§5)
 *
 * L'inscription est un point d'entrée PUBLIC (aucune authentification) : un nouveau client crée
 * son propre espace (Organisation) + son compte ADMIN fondateur, puis est directement connecté
 * (même émission de session que /auth/login) pour éviter un login juste après.
 */

const DEVISES = ['FCFA', 'EUR', 'USD', 'CAD'] as const
const LANGUES = ['FR', 'EN'] as const

const inscriptionSchema = {
  body: {
    type: 'object',
    required: ['nomOrganisation', 'devise', 'langue', 'email', 'password'],
    additionalProperties: false,
    properties: {
      nomOrganisation: { type: 'string', minLength: 1, maxLength: 200 },
      devise: { type: 'string', enum: DEVISES },
      langue: { type: 'string', enum: LANGUES },
      // Forme d'email basique (sans ajv-formats) : un `@` et un point dans le domaine.
      email: {
        type: 'string',
        minLength: 3,
        maxLength: 254,
        pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      },
      // min 8 caractères, aligné sur utilisateurs.route / changer-mot-de-passe.
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
} as const

interface InscriptionBody {
  nomOrganisation: string
  devise: (typeof DEVISES)[number]
  langue: (typeof LANGUES)[number]
  email: string
  password: string
}

export const organisationsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post<{ Body: InscriptionBody }>(
    '/organisations/inscription',
    { schema: inscriptionSchema },
    async (req, reply) => {
      try {
        // Flux public : pas encore d'organisation ni de contexte → runUnscoped (l'email est
        // global, et l'org de l'admin est renseignée explicitement dans le service).
        const admin = await orgContext.runUnscoped(async () =>
          inscrireOrganisation(app.prisma, req.body),
        )
        // Connexion directe : émet le même couple access token + cookie refresh qu'un login.
        const accessToken = await emettreSession(reply, admin)
        return reply.code(201).send({
          accessToken,
          user: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            langue: langueEffective(admin),
            devise: admin.devise,
          },
        })
      } catch (err) {
        if (err instanceof EmailDejaUtiliseError) {
          // Flux public non authentifié : on traduit dans la langue CHOISIE au formulaire.
          return reply
            .code(409)
            .send({ error: 'Conflict', message: t(req.body.langue, 'organisations.inscriptionImpossible') })
        }
        throw err
      }
    },
  )

  // GET /organisations/moi — paramètres (immuables) de l'organisation de l'utilisateur connecté
  // + volume de membres face au forfait. Lecture réservée aux rôles du bureau (matrice
  // Organisation:read → tous sauf MEMBRE_SIMPLE et SUPER_ADMIN). Scopé par le contexte org.
  app.get(
    '/organisations/moi',
    { preHandler: [authenticate, requirePermission('Organisation', 'read')] },
    async (req, reply) => {
      const organisationId = req.user.organisationId
      if (!organisationId) {
        // Cas théorique (un compte tenant a toujours une org ; le SUPER_ADMIN est déjà bloqué
        // par la matrice en amont) — repli défensif.
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'organisations.introuvable') })
      }
      const organisation = await chargerOrganisationCourante(app.prisma, organisationId)
      if (!organisation) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'organisations.introuvable') })
      }
      return organisation
    },
  )
}

export default organisationsRoutes
