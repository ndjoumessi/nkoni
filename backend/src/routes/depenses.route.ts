import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, type Role } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import { reconcilierVersements } from '../services/versement.service'
import {
  calculerTresorerie,
  validerTransition,
  estEditable,
  DepenseIntrouvableError,
  TransitionDepenseInvalideError,
  DepenseNonEditableError,
  type StatutDepense,
} from '../services/tresorerie.service'

/**
 * Trésorerie / dépenses (§5). Permissions (matrice « Depense ») : saisie/édition TRESORIERE/
 * PRESIDENT/ADMIN, lecture rôles de gestion. Les TRANSITIONS de workflow sont gardées par des
 * listes de rôles dédiées : approbation/rejet = COMMISSAIRE_COMPTES/PRESIDENT/ADMIN ; marquage
 * payé = TRESORIERE/PRESIDENT/ADMIN. Écritures en FK SCALAIRES (organisationId injecté).
 */

const CATEGORIES = ['AIDE_MEMBRE', 'FUNERAILLES', 'EVENEMENT', 'FONCTIONNEMENT', 'AUTRE'] as const
const STATUTS = ['BROUILLON', 'EN_ATTENTE', 'APPROUVEE', 'REJETEE', 'PAYEE'] as const

const ROLES_APPROBATION: readonly Role[] = ['ADMIN', 'PRESIDENT', 'COMMISSAIRE_COMPTES']
const ROLES_PAIEMENT: readonly Role[] = ['ADMIN', 'PRESIDENT', 'TRESORIERE']

const depenseProps = {
  montant: { type: 'integer', minimum: 1 },
  date: { type: 'string', minLength: 4, maxLength: 40 },
  description: { type: 'string', minLength: 1, maxLength: 1000 },
  categorie: { type: 'string', enum: CATEGORIES },
  beneficiaireMembreId: { type: 'string' },
} as const

const createSchema = {
  body: {
    type: 'object',
    required: ['montant', 'date', 'description'],
    additionalProperties: false,
    properties: {
      ...depenseProps,
      // Statut initial : brouillon (défaut) ou soumission directe pour approbation.
      statut: { type: 'string', enum: ['BROUILLON', 'EN_ATTENTE'] },
    },
  },
} as const

const updateSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      ...depenseProps,
      // Seule transition permise à l'édition : soumettre (BROUILLON → EN_ATTENTE).
      statut: { type: 'string', enum: ['BROUILLON', 'EN_ATTENTE'] },
    },
  },
} as const

const listSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      statut: { type: 'string', enum: STATUTS },
      categorie: { type: 'string', enum: CATEGORIES },
      dateDebut: { type: 'string', maxLength: 40 },
      dateFin: { type: 'string', maxLength: 40 },
    },
  },
} as const

const rejeterSchema = {
  body: {
    type: 'object',
    required: ['motifRejet'],
    additionalProperties: false,
    properties: { motifRejet: { type: 'string', minLength: 1, maxLength: 1000 } },
  },
} as const

interface CreateBody {
  montant: number
  date: string
  description: string
  categorie?: (typeof CATEGORIES)[number]
  beneficiaireMembreId?: string
  statut?: 'BROUILLON' | 'EN_ATTENTE'
}
type UpdateBody = Partial<CreateBody>

/** Mappe une erreur métier typée → réponse HTTP traduite. Retourne true si gérée. */
function reply4xx(err: unknown, reply: FastifyReply): boolean {
  const langue = langueDeRequete(reply.request)
  if (err instanceof DepenseIntrouvableError) {
    reply.code(404).send({ error: 'Not Found', message: t(langue, 'tresorerie.introuvable') })
    return true
  }
  if (err instanceof TransitionDepenseInvalideError) {
    reply.code(409).send({ error: 'Conflict', message: t(langue, 'tresorerie.transitionInvalide') })
    return true
  }
  if (err instanceof DepenseNonEditableError) {
    reply.code(409).send({ error: 'Conflict', message: t(langue, 'tresorerie.nonEditable') })
    return true
  }
  return false
}

function parseDateFiltre(v: string | undefined): Date | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function refuserSiRoleAbsent(req: FastifyRequest, reply: FastifyReply, roles: readonly Role[]): boolean {
  if (roles.includes(req.user.role as Role)) return false
  reply.code(403).send({ error: 'Forbidden', message: t(langueDeRequete(req), 'tresorerie.actionNonAutorisee') })
  return true
}

export const depensesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') => requirePermission('Depense', action)

  /** Charge une dépense scopée, ou lève DepenseIntrouvableError (→ 404). */
  async function chargerDepense(id: string) {
    const d = await app.prisma.depense.findUnique({ where: { id } })
    if (!d) throw new DepenseIntrouvableError()
    return d
  }

  // GET /tresorerie — solde de caisse (entrées/sorties/solde) + ventilation par catégorie.
  app.get<{ Querystring: { dateDebut?: string; dateFin?: string } }>(
    '/tresorerie',
    { preHandler: [authenticate, perm('read')] },
    async (req) => {
      const filtre: { dateDebut?: Date; dateFin?: Date } = {}
      const d1 = parseDateFiltre(req.query.dateDebut)
      const d2 = parseDateFiltre(req.query.dateFin)
      if (d1) filtre.dateDebut = d1
      if (d2) filtre.dateFin = d2
      return calculerTresorerie(app.prisma, filtre)
    },
  )

  // GET /tresorerie/reconciliation — filet de sécurité des soldes (audit M2) : compare, par
  // contribution, le compteur dénormalisé `montantVerse` à la somme réelle des versements.
  // Tout écart signale une dérive. Lecture seule, même audience financière que /tresorerie.
  app.get(
    '/tresorerie/reconciliation',
    { preHandler: [authenticate, perm('read')] },
    async () => {
      const ecarts = await reconcilierVersements(app.prisma)
      return { coherent: ecarts.length === 0, nbEcarts: ecarts.length, ecarts }
    },
  )

  // GET /depenses — liste filtrable (statut, catégorie, période).
  app.get<{ Querystring: { statut?: StatutDepense; categorie?: string; dateDebut?: string; dateFin?: string } }>(
    '/depenses',
    { schema: listSchema, preHandler: [authenticate, perm('read')] },
    async (req) => {
      const where: Prisma.DepenseWhereInput = {}
      if (req.query.statut) where.statut = req.query.statut
      if (req.query.categorie) where.categorie = req.query.categorie as (typeof CATEGORIES)[number]
      const d1 = parseDateFiltre(req.query.dateDebut)
      const d2 = parseDateFiltre(req.query.dateFin)
      if (d1 || d2) where.date = { ...(d1 ? { gte: d1 } : {}), ...(d2 ? { lte: d2 } : {}) }
      return app.prisma.depense.findMany({ where, orderBy: { date: 'desc' } })
    },
  )

  // GET /depenses/:id
  app.get<{ Params: { id: string } }>(
    '/depenses/:id',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      try {
        return await chargerDepense(req.params.id)
      } catch (err) {
        if (reply4xx(err, reply)) return
        throw err
      }
    },
  )

  // POST /depenses — création (BROUILLON par défaut, ou EN_ATTENTE pour soumettre directement).
  app.post<{ Body: CreateBody }>(
    '/depenses',
    { schema: createSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      const b = req.body
      const data: CreationScopee<Prisma.DepenseUncheckedCreateInput> = {
        montant: b.montant,
        date: new Date(b.date),
        description: b.description,
        saisiParId: req.user.sub ?? '',
      }
      if (b.categorie !== undefined) data.categorie = b.categorie
      if (b.statut !== undefined) data.statut = b.statut
      if (b.beneficiaireMembreId !== undefined) data.beneficiaireMembreId = b.beneficiaireMembreId
      const cree = await app.prisma.depense.create({ data: data as Prisma.DepenseUncheckedCreateInput })
      return reply.code(201).send(cree)
    },
  )

  // PATCH /depenses/:id — édition (seulement BROUILLON/EN_ATTENTE) + soumission BROUILLON→EN_ATTENTE.
  app.patch<{ Params: { id: string }; Body: UpdateBody }>(
    '/depenses/:id',
    { schema: updateSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      try {
        const actuelle = await chargerDepense(req.params.id)
        if (!estEditable(actuelle.statut)) throw new DepenseNonEditableError(actuelle.statut)

        const b = req.body
        if (b.statut !== undefined && b.statut !== actuelle.statut) {
          validerTransition(actuelle.statut, b.statut) // seule EN_ATTENTE atteignable ici
        }
        const data: Prisma.DepenseUncheckedUpdateInput = {}
        if (b.montant !== undefined) data.montant = b.montant
        if (b.date !== undefined) data.date = new Date(b.date)
        if (b.description !== undefined) data.description = b.description
        if (b.categorie !== undefined) data.categorie = b.categorie
        if (b.beneficiaireMembreId !== undefined) data.beneficiaireMembreId = b.beneficiaireMembreId
        if (b.statut !== undefined) data.statut = b.statut

        return await app.prisma.depense.update({ where: { id: req.params.id }, data })
      } catch (err) {
        if (reply4xx(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /depenses/:id — supprime un brouillon / une dépense non encore décidée.
  app.delete<{ Params: { id: string } }>(
    '/depenses/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        const d = await chargerDepense(req.params.id)
        if (!estEditable(d.statut)) throw new DepenseNonEditableError(d.statut)
        await app.prisma.depense.delete({ where: { id: req.params.id } })
        return reply.code(204).send()
      } catch (err) {
        if (reply4xx(err, reply)) return
        throw err
      }
    },
  )

  // POST /depenses/:id/approuver — EN_ATTENTE → APPROUVEE (COMMISSAIRE_COMPTES/PRESIDENT/ADMIN).
  app.post<{ Params: { id: string } }>(
    '/depenses/:id/approuver',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      if (refuserSiRoleAbsent(req, reply, ROLES_APPROBATION)) return
      try {
        const d = await chargerDepense(req.params.id)
        validerTransition(d.statut, 'APPROUVEE')
        return await app.prisma.depense.update({
          where: { id: req.params.id },
          data: { statut: 'APPROUVEE', approuveParId: req.user.sub ?? '', motifRejet: null },
        })
      } catch (err) {
        if (reply4xx(err, reply)) return
        throw err
      }
    },
  )

  // POST /depenses/:id/rejeter — EN_ATTENTE → REJETEE (+ motif).
  app.post<{ Params: { id: string }; Body: { motifRejet: string } }>(
    '/depenses/:id/rejeter',
    { schema: rejeterSchema, preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      if (refuserSiRoleAbsent(req, reply, ROLES_APPROBATION)) return
      try {
        const d = await chargerDepense(req.params.id)
        validerTransition(d.statut, 'REJETEE')
        return await app.prisma.depense.update({
          where: { id: req.params.id },
          data: { statut: 'REJETEE', approuveParId: req.user.sub ?? '', motifRejet: req.body.motifRejet },
        })
      } catch (err) {
        if (reply4xx(err, reply)) return
        throw err
      }
    },
  )

  // POST /depenses/:id/marquer-payee — APPROUVEE → PAYEE (TRESORIERE/PRESIDENT/ADMIN).
  app.post<{ Params: { id: string } }>(
    '/depenses/:id/marquer-payee',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      if (refuserSiRoleAbsent(req, reply, ROLES_PAIEMENT)) return
      try {
        const d = await chargerDepense(req.params.id)
        validerTransition(d.statut, 'PAYEE')
        return await app.prisma.depense.update({ where: { id: req.params.id }, data: { statut: 'PAYEE' } })
      } catch (err) {
        if (reply4xx(err, reply)) return
        throw err
      }
    },
  )
}

export default depensesRoutes
