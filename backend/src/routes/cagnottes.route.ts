import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission, requireRoles, type Role } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import {
  collecteCagnotte,
  soldeCagnotte,
  progressionCagnotte,
  estEditableCagnotte,
  validerReversement,
  ReversementInvalideError,
  type StatutCagnotteValue,
} from '../services/cagnotte.service'

/**
 * Cagnottes d'événement (§4.9) — collectes de solidarité (deuil, mariage, naissance…).
 *
 * POCHE SÉPARÉE de la trésorerie générale : dons des membres → reversement au bénéficiaire.
 * Permissions (matrice « Cagnotte ») : gestion de la cagnotte = bureau (create/read/update/
 * delete). La SAISIE DES DONS, le REVERSEMENT et la CLÔTURE (flux d'argent) sont gardés à part
 * par requireRoles(['ADMIN','PRESIDENT','TRESORIERE']). Écritures en FK SCALAIRES (organisationId
 * injecté par l'extension tenant). Messages d'erreur bilingues FR/EN en ligne.
 */

const TYPES = ['DEUIL', 'MARIAGE', 'NAISSANCE', 'AUTRE'] as const
const MODES = ['ESPECES', 'TIERS', 'AUTRE'] as const
const ROLES_ARGENT: readonly Role[] = ['ADMIN', 'PRESIDENT', 'TRESORIERE']


interface CreateBody {
  titre: string
  type?: (typeof TYPES)[number]
  description?: string
  objectif?: number
  dateEvenement?: string
  beneficiaireMembreId?: string
  beneficiaireNom?: string
}
type UpdateBody = Partial<CreateBody>
interface DonBody {
  membreId: string
  montant: number
  date?: string
  mode?: (typeof MODES)[number]
  note?: string
}
interface ClotureBody {
  montantReverse?: number
  dateReversement?: string
}

const cagnotteBodyProps = {
  titre: { type: 'string', minLength: 1, maxLength: 200 },
  type: { type: 'string', enum: TYPES },
  description: { type: 'string', maxLength: 2000 },
  objectif: { type: 'integer', minimum: 1 },
  dateEvenement: { type: 'string', minLength: 4, maxLength: 40 },
  beneficiaireMembreId: { type: 'string' },
  beneficiaireNom: { type: 'string', maxLength: 200 },
} as const

const createSchema = {
  body: { type: 'object', additionalProperties: false, required: ['titre'], properties: cagnotteBodyProps },
} as const
const updateSchema = {
  body: { type: 'object', additionalProperties: false, properties: cagnotteBodyProps },
} as const
const donSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['membreId', 'montant'],
    properties: {
      membreId: { type: 'string', minLength: 1 },
      montant: { type: 'integer', minimum: 1 },
      date: { type: 'string', minLength: 4, maxLength: 40 },
      mode: { type: 'string', enum: MODES },
      note: { type: 'string', maxLength: 500 },
    },
  },
} as const
const clotureSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      montantReverse: { type: 'integer', minimum: 0 },
      dateReversement: { type: 'string', minLength: 4, maxLength: 40 },
    },
  },
} as const

const CAGNOTTE_SELECT = {
  id: true,
  titre: true,
  type: true,
  description: true,
  objectif: true,
  dateEvenement: true,
  statut: true,
  beneficiaireMembreId: true,
  beneficiaireNom: true,
  montantReverse: true,
  dateReversement: true,
  createdAt: true,
  beneficiaireMembre: { select: { id: true, nom: true, prenom: true } },
} as const

const DON_SELECT = {
  id: true,
  montant: true,
  date: true,
  mode: true,
  note: true,
  membre: { select: { id: true, nom: true, prenom: true } },
} as const

// Cagnotte telle que renvoyée par CAGNOTTE_SELECT (typage minimal, sans dépendre du client généré).
interface CagnotteRow {
  id: string
  statut: StatutCagnotteValue
  objectif: number | null
  montantReverse: number
  beneficiaireMembre: { id: string; nom: string; prenom: string } | null
  beneficiaireNom: string | null
  [k: string]: unknown
}

// Ligne d'agrégat groupBy (typée explicitement — indépendante du client généré).
interface SommeDons {
  cagnotteId: string
  _sum: { montant: number | null }
  _count: { _all: number }
}

/** Enrichit une cagnotte de son bénéficiaire résolu + collecte/progression/solde. */
function presenter(c: CagnotteRow, collecte: number, nbDons: number) {
  const beneficiaire = c.beneficiaireMembre
    ? `${c.beneficiaireMembre.prenom} ${c.beneficiaireMembre.nom}`.trim()
    : (c.beneficiaireNom ?? null)
  return {
    ...c,
    beneficiaire,
    collecte,
    nbDons,
    progression: progressionCagnotte(collecte, c.objectif),
    solde: soldeCagnotte(collecte, c.montantReverse),
  }
}

export const cagnottesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const charger = (id: string) =>
    app.prisma.cagnotteEvenement.findUnique({ where: { id }, select: CAGNOTTE_SELECT })

  // GET /cagnottes — liste (toutes ouvertes puis clôturées), avec collecte/progression/solde.
  app.get(
    '/cagnottes',
    { preHandler: [authenticate, requirePermission('Cagnotte', 'read')] },
    async () => {
      const cagnottes = (await app.prisma.cagnotteEvenement.findMany({
        orderBy: [{ statut: 'asc' }, { createdAt: 'desc' }],
        select: CAGNOTTE_SELECT,
      })) as unknown as CagnotteRow[]
      const sommes = (await app.prisma.donCagnotte.groupBy({
        by: ['cagnotteId'],
        _sum: { montant: true },
        _count: { _all: true },
      })) as unknown as SommeDons[]
      const parCagnotte = new Map<string, { collecte: number; nbDons: number }>()
      for (const s of sommes) {
        parCagnotte.set(s.cagnotteId, { collecte: s._sum.montant ?? 0, nbDons: s._count._all })
      }
      return cagnottes.map((c) => {
        const agg = parCagnotte.get(c.id)
        return presenter(c, agg?.collecte ?? 0, agg?.nbDons ?? 0)
      })
    },
  )

  // GET /cagnottes/:id — détail + liste des dons.
  app.get<{ Params: { id: string } }>(
    '/cagnottes/:id',
    { preHandler: [authenticate, requirePermission('Cagnotte', 'read')] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      const dons = await app.prisma.donCagnotte.findMany({
        where: { cagnotteId: req.params.id },
        orderBy: { date: 'desc' },
        select: DON_SELECT,
      })
      const collecte = collecteCagnotte(dons as { montant: number }[])
      return { ...presenter(c as unknown as CagnotteRow, collecte, dons.length), dons }
    },
  )

  // POST /cagnottes — création (bureau).
  app.post<{ Body: CreateBody }>(
    '/cagnottes',
    { schema: createSchema, preHandler: [authenticate, requirePermission('Cagnotte', 'create')] },
    async (req, reply) => {
      const b = req.body
      if (b.beneficiaireMembreId) {
        const m = await app.prisma.membre.findUnique({
          where: { id: b.beneficiaireMembreId },
          select: { id: true },
        })
        if (!m) return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'cagnottes.membreIntrouvable') })
      }
      const data: CreationScopee<Prisma.CagnotteEvenementUncheckedCreateInput> = {
        titre: b.titre,
        creeParId: req.user.sub ?? '',
      }
      if (b.type !== undefined) data.type = b.type
      if (b.description !== undefined) data.description = b.description
      if (b.objectif !== undefined) data.objectif = b.objectif
      if (b.dateEvenement !== undefined) data.dateEvenement = new Date(b.dateEvenement)
      if (b.beneficiaireMembreId !== undefined) data.beneficiaireMembreId = b.beneficiaireMembreId
      if (b.beneficiaireNom !== undefined) data.beneficiaireNom = b.beneficiaireNom
      const cree = await app.prisma.cagnotteEvenement.create({
        data: data as Prisma.CagnotteEvenementUncheckedCreateInput,
        select: CAGNOTTE_SELECT,
      })
      return reply.code(201).send(presenter(cree as unknown as CagnotteRow, 0, 0))
    },
  )

  // PATCH /cagnottes/:id — édition (seulement si OUVERTE).
  app.patch<{ Params: { id: string }; Body: UpdateBody }>(
    '/cagnottes/:id',
    { schema: updateSchema, preHandler: [authenticate, requirePermission('Cagnotte', 'update')] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      if (!estEditableCagnotte((c as unknown as CagnotteRow).statut)) {
        return reply.code(409).send({ error: 'Conflict', message: t(langueDeRequete(req), 'cagnottes.cloturee') })
      }
      const b = req.body
      if (b.beneficiaireMembreId) {
        const m = await app.prisma.membre.findUnique({
          where: { id: b.beneficiaireMembreId },
          select: { id: true },
        })
        if (!m) return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'cagnottes.membreIntrouvable') })
      }
      const data: Prisma.CagnotteEvenementUncheckedUpdateInput = {}
      if (b.titre !== undefined) data.titre = b.titre
      if (b.type !== undefined) data.type = b.type
      if (b.description !== undefined) data.description = b.description
      if (b.objectif !== undefined) data.objectif = b.objectif
      if (b.dateEvenement !== undefined) data.dateEvenement = b.dateEvenement ? new Date(b.dateEvenement) : null
      if (b.beneficiaireMembreId !== undefined) data.beneficiaireMembreId = b.beneficiaireMembreId || null
      if (b.beneficiaireNom !== undefined) data.beneficiaireNom = b.beneficiaireNom || null
      const maj = await app.prisma.cagnotteEvenement.update({
        where: { id: req.params.id },
        data,
        select: CAGNOTTE_SELECT,
      })
      const agg = await app.prisma.donCagnotte.aggregate({
        where: { cagnotteId: req.params.id },
        _sum: { montant: true },
        _count: { _all: true },
      })
      return presenter(maj as unknown as CagnotteRow, agg._sum.montant ?? 0, agg._count._all)
    },
  )

  // DELETE /cagnottes/:id — supprime la cagnotte (et ses dons en cascade).
  app.delete<{ Params: { id: string } }>(
    '/cagnottes/:id',
    { preHandler: [authenticate, requirePermission('Cagnotte', 'delete')] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      await app.prisma.cagnotteEvenement.delete({ where: { id: req.params.id } })
      return reply.code(204).send()
    },
  )

  // POST /cagnottes/:id/dons — enregistre un don d'un membre (flux d'argent → rôles dédiés).
  app.post<{ Params: { id: string }; Body: DonBody }>(
    '/cagnottes/:id/dons',
    { schema: donSchema, preHandler: [authenticate, requireRoles([...ROLES_ARGENT])] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      if (!estEditableCagnotte((c as unknown as CagnotteRow).statut)) {
        return reply.code(409).send({ error: 'Conflict', message: t(langueDeRequete(req), 'cagnottes.cloturee') })
      }
      const b = req.body
      const m = await app.prisma.membre.findUnique({ where: { id: b.membreId }, select: { id: true } })
      if (!m) return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'cagnottes.membreIntrouvable') })
      const data: CreationScopee<Prisma.DonCagnotteUncheckedCreateInput> = {
        cagnotteId: req.params.id,
        membreId: b.membreId,
        montant: b.montant,
        date: b.date ? new Date(b.date) : new Date(),
        saisiParId: req.user.sub ?? '',
      }
      if (b.mode !== undefined) data.mode = b.mode
      if (b.note !== undefined) data.note = b.note
      const don = await app.prisma.donCagnotte.create({
        data: data as Prisma.DonCagnotteUncheckedCreateInput,
        select: DON_SELECT,
      })
      return reply.code(201).send(don)
    },
  )

  // DELETE /cagnottes/:id/dons/:donId — retire un don (seulement si cagnotte OUVERTE).
  app.delete<{ Params: { id: string; donId: string } }>(
    '/cagnottes/:id/dons/:donId',
    { preHandler: [authenticate, requireRoles([...ROLES_ARGENT])] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      if (!estEditableCagnotte((c as unknown as CagnotteRow).statut)) {
        return reply.code(409).send({ error: 'Conflict', message: t(langueDeRequete(req), 'cagnottes.cloturee') })
      }
      const don = await app.prisma.donCagnotte.findUnique({
        where: { id: req.params.donId },
        select: { cagnotteId: true },
      })
      if (!don || don.cagnotteId !== req.params.id) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.donIntrouvable') })
      }
      await app.prisma.donCagnotte.delete({ where: { id: req.params.donId } })
      return reply.code(204).send()
    },
  )

  // POST /cagnottes/:id/cloturer — enregistre le reversement au bénéficiaire + clôt la cagnotte.
  app.post<{ Params: { id: string }; Body: ClotureBody }>(
    '/cagnottes/:id/cloturer',
    { schema: clotureSchema, preHandler: [authenticate, requireRoles([...ROLES_ARGENT])] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      const agg = await app.prisma.donCagnotte.aggregate({
        where: { cagnotteId: req.params.id },
        _sum: { montant: true },
        _count: { _all: true },
      })
      const collecte = agg._sum.montant ?? 0
      const montantReverse = req.body.montantReverse ?? 0
      try {
        validerReversement(montantReverse, collecte)
      } catch (err) {
        if (err instanceof ReversementInvalideError) {
          return reply.code(400).send({ error: 'Bad Request', message: t(langueDeRequete(req), 'cagnottes.reversement') })
        }
        throw err
      }
      const maj = await app.prisma.cagnotteEvenement.update({
        where: { id: req.params.id },
        data: {
          statut: 'CLOTUREE',
          montantReverse,
          dateReversement: req.body.dateReversement ? new Date(req.body.dateReversement) : new Date(),
        },
        select: CAGNOTTE_SELECT,
      })
      return presenter(maj as unknown as CagnotteRow, collecte, agg._count._all)
    },
  )

  // POST /cagnottes/:id/rouvrir — rouvre une cagnotte clôturée (réinitialise le reversement).
  app.post<{ Params: { id: string } }>(
    '/cagnottes/:id/rouvrir',
    { preHandler: [authenticate, requireRoles([...ROLES_ARGENT])] },
    async (req, reply) => {
      const c = await charger(req.params.id)
      if (!c) return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'cagnottes.introuvable') })
      const maj = await app.prisma.cagnotteEvenement.update({
        where: { id: req.params.id },
        data: { statut: 'OUVERTE', montantReverse: 0, dateReversement: null },
        select: CAGNOTTE_SELECT,
      })
      const agg = await app.prisma.donCagnotte.aggregate({
        where: { cagnotteId: req.params.id },
        _sum: { montant: true },
        _count: { _all: true },
      })
      return presenter(maj as unknown as CagnotteRow, agg._sum.montant ?? 0, agg._count._all)
    },
  )
}

export default cagnottesRoutes
