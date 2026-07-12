import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { t, langueDeRequete } from '../lib/i18n'
import {
  calculerDashboardComplet,
  calculerDashboardFinancier,
  calculerDashboardRestreint,
  calculerDashboardPerso,
  calculerFinancesConsolidees,
  MembreIntrouvableError,
} from '../services/dashboard.service'

/**
 * Tableau de bord (§5 point 8) — un endpoint unique, vue adaptée au rôle (§2).
 *
 * CHOIX D'AUTORISATION (vs le pattern `requirePermission` utilisé ailleurs) :
 *   Les autres routes protègent une (entité, action) précise via `requirePermission`.
 *   Le dashboard n'est PAS lié à une entité unique : c'est un AGRÉGAT transverse
 *   (membres + contributions + branches). L'autorisation ne s'exprime donc pas en
 *   allow/deny sur une entité, mais en SÉLECTION DE VUE selon le rôle. On applique donc
 *   seulement `authenticate` (401 si non authentifié), puis on route en interne vers la
 *   fonction de vue correspondant à `req.user.role`.
 *
 * GUIDE_RELIGIEUX : aucun droit sur les entités MVP (§2) → aucune vue de dashboard n'a de
 *   sens pour ce rôle. CHOIX : 403 (plutôt qu'un 200 vide). Un dashboard vide laisserait
 *   croire à une vue « valide mais sans données » ; 403 signale correctement qu'aucune vue
 *   n'est définie pour ce rôle dans le MVP. (Idem pour tout rôle non prévu → 403 défensif.)
 */

const anneeCourante = (): number => new Date().getFullYear()

export const dashboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/dashboard',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const role = req.user.role
      const annee = anneeCourante()

      switch (role) {
        case 'ADMIN':
        case 'PRESIDENT': {
          const [base, financesConsolidees] = await Promise.all([
            calculerDashboardComplet(app.prisma, annee),
            // Best-effort : un agrégat qui échoue ne doit PAS casser tout le dashboard (la carte
            // consolidée se masque simplement — le champ est optionnel).
            calculerFinancesConsolidees(app.prisma).catch(() => undefined),
          ])
          return { ...base, financesConsolidees }
        }

        case 'TRESORIERE':
        case 'COMMISSAIRE_COMPTES': {
          const [base, financesConsolidees] = await Promise.all([
            calculerDashboardFinancier(app.prisma, annee),
            // Best-effort : un agrégat qui échoue ne doit PAS casser tout le dashboard (la carte
            // consolidée se masque simplement — le champ est optionnel).
            calculerFinancesConsolidees(app.prisma).catch(() => undefined),
          ])
          return { ...base, financesConsolidees }
        }

        case 'SECRETAIRE':
          return calculerDashboardRestreint(app.prisma)

        case 'MEMBRE_SIMPLE': {
          // Résout le membre rattaché au compte connecté, puis renvoie sa vue perso.
          const membre = await app.prisma.membre.findUnique({
            where: { compteUtilisateurId: req.user.sub ?? '' },
            select: { id: true },
          })
          if (!membre) {
            return reply.code(404).send({
              error: 'Not Found',
              message: t(langueDeRequete(req), 'dashboard.aucunMembreRattache'),
            })
          }
          try {
            return await calculerDashboardPerso(app.prisma, membre.id, annee)
          } catch (err) {
            if (err instanceof MembreIntrouvableError) {
              return reply.code(404).send({
                error: 'Not Found',
                message: t(langueDeRequete(req), 'dashboard.membreIntrouvable', {
                  membreId: err.membreId,
                }),
              })
            }
            throw err
          }
        }

        default:
          // GUIDE_RELIGIEUX et tout rôle non prévu : aucune vue définie en MVP.
          return reply.code(403).send({
            error: 'Forbidden',
            message: t(langueDeRequete(req), 'dashboard.aucunTableauBord', { role }),
          })
      }
    },
  )
}

export default dashboardRoutes
