import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, requireRoles, type Role } from '../middlewares/permissions'
import { langueDeRequete } from '../lib/i18n'
import {
  estEditableAmende,
  validerTransitionAmende,
  totauxAmendes,
  TransitionAmendeInvalideError,
  type StatutAmendeValue,
} from '../services/amende.service'

/**
 * Amendes / pénalités (§4.10) — sanctions financières saisies par le bureau.
 *
 * Permissions (matrice « Amende ») : saisie/édition = bureau (create/read/update/delete). Les
 * TRANSITIONS de statut — ENCAISSEMENT (payer) et ANNULATION — sont gardées à part par
 * requireRoles(['ADMIN','PRESIDENT','TRESORIERE']). Lecture rôles de gestion ; MEMBRE_SIMPLE
 * limité à SES propres amendes (filtrage en route). Écritures en FK SCALAIRES (organisationId
 * injecté par l'extension tenant). Messages d'erreur bilingues FR/EN en ligne.
 */

const TYPES = ['RETARD_COTISATION', 'ABSENCE_REUNION', 'AUTRE'] as const
const STATUTS = ['IMPAYEE', 'PAYEE', 'ANNULEE'] as const
const MODES = ['ESPECES', 'TIERS', 'AUTRE'] as const
const ROLES_ARGENT: readonly Role[] = ['ADMIN', 'PRESIDENT', 'TRESORIERE']

type Langue = 'FR' | 'EN'
const MSG = {
  introuvable: { FR: 'Amende introuvable.', EN: 'Fine not found.' },
  membreIntrouvable: { FR: 'Membre introuvable.', EN: 'Member not found.' },
  nonEditable: { FR: 'Amende réglée ou annulée : non modifiable.', EN: 'Fine settled or cancelled: not editable.' },
  transition: { FR: 'Action impossible sur cette amende.', EN: 'Action not allowed on this fine.' },
} as const

interface CreateBody {
  membreId: string
  type?: (typeof TYPES)[number]
  motif: string
  montant: number
  dateAmende?: string
}
type UpdateBody = Partial<Omit<CreateBody, 'membreId'>>
interface PayerBody {
  datePaiement?: string
  modePaiement?: (typeof MODES)[number]
}

const amendeBodyProps = {
  type: { type: 'string', enum: TYPES },
  motif: { type: 'string', minLength: 1, maxLength: 500 },
  montant: { type: 'integer', minimum: 1 },
  dateAmende: { type: 'string', minLength: 4, maxLength: 40 },
} as const

const createSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['membreId', 'motif', 'montant'],
    properties: { membreId: { type: 'string', minLength: 1 }, ...amendeBodyProps },
  },
} as const
const updateSchema = {
  body: { type: 'object', additionalProperties: false, properties: amendeBodyProps },
} as const
const payerSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      datePaiement: { type: 'string', minLength: 4, maxLength: 40 },
      modePaiement: { type: 'string', enum: MODES },
    },
  },
} as const

const listQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { membreId: { type: 'string' }, statut: { type: 'string', enum: STATUTS } },
  },
} as const

const AMENDE_SELECT = {
  id: true,
  type: true,
  motif: true,
  montant: true,
  dateAmende: true,
  statut: true,
  datePaiement: true,
  modePaiement: true,
  membreId: true,
  createdAt: true,
  membre: { select: { id: true, nom: true, prenom: true } },
} as const

interface AmendeRow {
  statut: StatutAmendeValue
  montant: number
  [k: string]: unknown
}

export const amendesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const msg = (req: FastifyRequest, k: keyof typeof MSG): string => {
    const langue = langueDeRequete(req) as Langue
    return MSG[k][langue] ?? MSG[k].FR
  }
  const charger = (id: string) => app.prisma.amende.findUnique({ where: { id }, select: AMENDE_SELECT })

  // GET /amendes?membreId=&statut= — liste + totaux (dû / encaissé). MEMBRE_SIMPLE : les siennes.
  app.get<{ Querystring: { membreId?: string; statut?: (typeof STATUTS)[number] } }>(
    '/amendes',
    { schema: listQuerySchema, preHandler: [authenticate, requirePermission('Amende', 'read')] },
    async (req) => {
      const whereBase: Prisma.AmendeWhereInput = {}
      if (req.query.membreId) whereBase.membreId = req.query.membreId
      if (req.user.role === 'MEMBRE_SIMPLE') {
        whereBase.membre = { compteUtilisateurId: req.user.sub ?? '' }
      }
      const where: Prisma.AmendeWhereInput = { ...whereBase }
      if (req.query.statut) where.statut = req.query.statut

      const amendes = await app.prisma.amende.findMany({
        where,
        orderBy: [{ statut: 'asc' }, { dateAmende: 'desc' }],
        select: AMENDE_SELECT,
      })
      // Totaux sur le périmètre (membre/rôle) SANS le filtre de statut, pour un dû/encaissé stables.
      const pourTotaux = req.query.statut
        ? ((await app.prisma.amende.findMany({
            where: whereBase,
            select: { montant: true, statut: true },
          })) as unknown as AmendeRow[])
        : (amendes as unknown as AmendeRow[])
      return { amendes, totaux: totauxAmendes(pourTotaux) }
    },
  )

  // POST /amendes — saisie d'une amende (bureau).
  app.post<{ Body: CreateBody }>(
    '/amendes',
    { schema: createSchema, preHandler: [authenticate, requirePermission('Amende', 'create')] },
    async (req, reply) => {
      const b = req.body
      const m = await app.prisma.membre.findUnique({ where: { id: b.membreId }, select: { id: true } })
      if (!m) return reply.code(400).send({ error: 'Bad Request', message: msg(req, 'membreIntrouvable') })
      const data: CreationScopee<Prisma.AmendeUncheckedCreateInput> = {
        membreId: b.membreId,
        motif: b.motif,
        montant: b.montant,
        dateAmende: b.dateAmende ? new Date(b.dateAmende) : new Date(),
        creeParId: req.user.sub ?? '',
      }
      if (b.type !== undefined) data.type = b.type
      const cree = await app.prisma.amende.create({
        data: data as Prisma.AmendeUncheckedCreateInput,
        select: AMENDE_SELECT,
      })
      return reply.code(201).send(cree)
    },
  )

  // PATCH /amendes/:id — édition (seulement si IMPAYEE).
  app.patch<{ Params: { id: string }; Body: UpdateBody }>(
    '/amendes/:id',
    { schema: updateSchema, preHandler: [authenticate, requirePermission('Amende', 'update')] },
    async (req, reply) => {
      const a = await charger(req.params.id)
      if (!a) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      if (!estEditableAmende((a as unknown as AmendeRow).statut)) {
        return reply.code(409).send({ error: 'Conflict', message: msg(req, 'nonEditable') })
      }
      const b = req.body
      const data: Prisma.AmendeUncheckedUpdateInput = {}
      if (b.type !== undefined) data.type = b.type
      if (b.motif !== undefined) data.motif = b.motif
      if (b.montant !== undefined) data.montant = b.montant
      if (b.dateAmende !== undefined) data.dateAmende = new Date(b.dateAmende)
      return await app.prisma.amende.update({ where: { id: req.params.id }, data, select: AMENDE_SELECT })
    },
  )

  // DELETE /amendes/:id — supprime (seulement si IMPAYEE).
  app.delete<{ Params: { id: string } }>(
    '/amendes/:id',
    { preHandler: [authenticate, requirePermission('Amende', 'delete')] },
    async (req, reply) => {
      const a = await charger(req.params.id)
      if (!a) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      if (!estEditableAmende((a as unknown as AmendeRow).statut)) {
        return reply.code(409).send({ error: 'Conflict', message: msg(req, 'nonEditable') })
      }
      await app.prisma.amende.delete({ where: { id: req.params.id } })
      return reply.code(204).send()
    },
  )

  // POST /amendes/:id/payer — encaissement (flux d'argent → rôles dédiés).
  app.post<{ Params: { id: string }; Body: PayerBody }>(
    '/amendes/:id/payer',
    { schema: payerSchema, preHandler: [authenticate, requireRoles([...ROLES_ARGENT])] },
    async (req, reply) => {
      const a = await charger(req.params.id)
      if (!a) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      try {
        validerTransitionAmende((a as unknown as AmendeRow).statut, 'PAYEE')
      } catch (err) {
        if (err instanceof TransitionAmendeInvalideError) {
          return reply.code(409).send({ error: 'Conflict', message: msg(req, 'transition') })
        }
        throw err
      }
      return await app.prisma.amende.update({
        where: { id: req.params.id },
        data: {
          statut: 'PAYEE',
          datePaiement: req.body.datePaiement ? new Date(req.body.datePaiement) : new Date(),
          modePaiement: req.body.modePaiement ?? 'ESPECES',
        },
        select: AMENDE_SELECT,
      })
    },
  )

  // POST /amendes/:id/annuler — annulation (amende levée / erreur de saisie).
  app.post<{ Params: { id: string } }>(
    '/amendes/:id/annuler',
    { preHandler: [authenticate, requireRoles([...ROLES_ARGENT])] },
    async (req, reply) => {
      const a = await charger(req.params.id)
      if (!a) return reply.code(404).send({ error: 'Not Found', message: msg(req, 'introuvable') })
      try {
        validerTransitionAmende((a as unknown as AmendeRow).statut, 'ANNULEE')
      } catch (err) {
        if (err instanceof TransitionAmendeInvalideError) {
          return reply.code(409).send({ error: 'Conflict', message: msg(req, 'transition') })
        }
        throw err
      }
      return await app.prisma.amende.update({
        where: { id: req.params.id },
        data: { statut: 'ANNULEE' },
        select: AMENDE_SELECT,
      })
    },
  )
}

export default amendesRoutes
