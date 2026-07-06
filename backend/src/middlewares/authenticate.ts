import '@fastify/jwt' // charge l'augmentation de type (req.jwtVerify, req.user)
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Role } from './permissions'
import type { Langue } from '../lib/i18n'
import { auditContext } from '../lib/audit-context'
import { orgContext } from '../lib/org-context'

/**
 * Hook d'AUTHENTIFICATION minimal (vérification JWT uniquement).
 *
 * Périmètre volontairement réduit pour cette étape : il ne fait QUE vérifier un JWT
 * déjà émis et peupler `req.user`. La génération des tokens (login, refresh) fait
 * partie du module d'authentification complet, développé plus tard (spec §5.1).
 *
 * Responsabilité : si le token est absent ou invalide → 401. C'est ce hook, et non
 * `requirePermission`, qui protège l'accès non authentifié (séparation auth/autorisation).
 *
 * Nécessite que l'application ait enregistré `@fastify/jwt` (app.register(fastifyJwt, …)).
 */
export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Fourni par @fastify/jwt : vérifie le Bearer token et remplit `req.user`.
    await req.jwtVerify()
    // Renseigne l'acteur pour l'audit trail (V2 §5) — best-effort.
    auditContext.setActeur(req.user.sub)
    // Établit l'organisation courante (SaaS §2.2) : l'extension Prisma d'isolation scope
    // désormais toutes les requêtes de cette requête HTTP sur cette organisation.
    orgContext.setOrganisation(req.user.organisationId)
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Token JWT absent ou invalide.' })
  }
}

// Typage du contenu du JWT pour tout le backend.
// `payload` (entrée de signature) est volontairement large : il couvre à la fois
//   - l'access token : { sub, role, membreId? }
//   - le refresh token : { sub, typ: 'refresh' }
// `user` (sortie de vérification de l'access token, exposé en req.user) porte le rôle.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      role?: Role
      membreId?: string
      organisationId?: string
      langue?: Langue // §4 i18n — préférence de langue portée par l'access token
      typ?: 'refresh'
    }
    user: { sub?: string; role: Role; membreId?: string; organisationId?: string; langue?: Langue }
  }
}
