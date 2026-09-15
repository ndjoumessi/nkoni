import '@fastify/jwt' // charge l'augmentation de type (req.jwtVerify, req.user)
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Role } from './permissions'
import { t, langueDeRequete, type Langue } from '../lib/i18n'
import { auditContext } from '../lib/audit-context'
import { orgContext } from '../lib/org-context'
import { estRequeteAutoriseeEnDemo } from '../lib/demo'

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
): Promise<FastifyReply | void> {
  try {
    // Fourni par @fastify/jwt : vérifie le Bearer token et remplit `req.user`.
    await req.jwtVerify()
    // Renseigne l'acteur pour l'audit trail (V2 §5) — best-effort.
    auditContext.setActeur(req.user.sub)
    // Établit l'organisation courante (SaaS §2.2) : l'extension Prisma d'isolation scope
    // désormais toutes les requêtes de cette requête HTTP sur cette organisation.
    orgContext.setOrganisation(req.user.organisationId)
  } catch {
    // Token absent/invalide → req.user non peuplé : la langue est résolue via Accept-Language (§4).
    // `return reply...` (et non un simple appel suivi de `return`) : la sortie anticipée ne doit pas
    // dépendre du fait qu'un hook `onSend` reste synchrone pour empêcher l'exécution de la suite.
    return reply
      .code(401)
      .send({ error: 'Unauthorized', message: t(langueDeRequete(req), 'commun.tokenAbsent') })
  }

  // Espace de démonstration (spec 2026-09-15 §1.4) : un jeton `demo` CONSULTE, il n'écrit jamais.
  // Placé ici plutôt que route par route : toutes les routes tenant passent par ce hook, une route
  // ajoutée demain est donc couverte sans y penser. `routeOptions.url` = motif ('/membres/:id').
  if (req.user.demo === true && !estRequeteAutoriseeEnDemo(req.method, req.routeOptions?.url)) {
    return reply
      .code(403)
      .send({ error: 'Forbidden', message: t(langueDeRequete(req), 'commun.demoLectureSeule') })
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
      demo?: true // espace de démonstration (spec 2026-09-15) — émis par POST /demo/session seulement
      typ?: 'refresh'
    }
    user: {
      sub?: string
      role: Role
      membreId?: string
      organisationId?: string
      langue?: Langue
      demo?: boolean
    }
  }
}
