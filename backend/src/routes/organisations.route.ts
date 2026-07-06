import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { orgContext } from '../lib/org-context'
import { emettreSession } from '../lib/session'
import { t } from '../lib/i18n'
import { langueEffective } from '../services/auth.service'
import {
  inscrireOrganisation,
  EmailDejaUtiliseError,
} from '../services/organisation.service'

/**
 * Auto-inscription SaaS (§3.1) :
 *   POST /organisations/inscription → 201 { accessToken, user } + Set-Cookie refresh
 *
 * Point d'entrée PUBLIC (aucune authentification) : un nouveau client crée son propre
 * espace (Organisation) + son compte ADMIN fondateur, puis est directement connecté
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
          user: { id: admin.id, email: admin.email, role: admin.role, langue: langueEffective(admin) },
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
}

export default organisationsRoutes
