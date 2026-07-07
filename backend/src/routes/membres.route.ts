import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify'
import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { calculerStatutsMembres } from '../services/membreStatut.service'
import { t, langueDeRequete } from '../lib/i18n'

/**
 * CRUD Membre (§5 point 2), conforme à la matrice §2 :
 *   - Lecture : ADMIN, PRESIDENT, SECRETAIRE, TRESORIERE, COMMISSAIRE_COMPTES → tout ;
 *     MEMBRE_SIMPLE → UNIQUEMENT sa propre fiche (filtrage ci-dessous — la « lecture
 *     partielle » laissée en suspens à l'étape 5).
 *   - Création / mise à jour : ADMIN + SECRETAIRE (Créer/Modifier).
 *   - Suppression : ADMIN uniquement (SECRETAIRE n'a pas Delete).
 *
 * Règle métier §4.1 : au passage à un statut DECEDE ou INACTIF sans anneeFinContribution
 * fournie, celle-ci est renseignée automatiquement à l'année courante.
 */

type StatutMembre = 'ACTIF' | 'INACTIF' | 'DECEDE'

interface MembreCreateBody {
  nom: string
  prenom: string
  anneeAdhesion: number
  sexe?: string
  dateNaissance?: string
  fonctionSociale?: string
  statut?: StatutMembre
  telephone?: string
  adresse?: string
  brancheId?: string
  chefSousFamilleId?: string
  anneeFinContribution?: number
  compteUtilisateurId?: string
}

type MembreUpdateBody = Partial<MembreCreateBody>

/** Plafond de membres par organisation sur le plan gratuit (§10.2). */
export const PLAFOND_MEMBRES_PLAN_GRATUIT = 100

const STATUT_ENUM = ['ACTIF', 'INACTIF', 'DECEDE'] as const
// Statuts qui figent la fin de contribution (§4.1).
const STATUTS_FIN_CONTRIBUTION: readonly StatutMembre[] = ['DECEDE', 'INACTIF']

const membreProperties = {
  nom: { type: 'string', minLength: 1, maxLength: 200 },
  prenom: { type: 'string', minLength: 1, maxLength: 200 },
  sexe: { type: 'string', maxLength: 20 },
  dateNaissance: { type: 'string', maxLength: 40 },
  fonctionSociale: { type: 'string', maxLength: 200 },
  statut: { type: 'string', enum: STATUT_ENUM },
  telephone: { type: 'string', maxLength: 40 },
  adresse: { type: 'string', maxLength: 500 },
  brancheId: { type: 'string' },
  chefSousFamilleId: { type: 'string' },
  anneeAdhesion: { type: 'integer', minimum: 1900, maximum: 2200 },
  anneeFinContribution: { type: 'integer', minimum: 1900, maximum: 2200 },
  compteUtilisateurId: { type: 'string' },
} as const

const createMembreSchema = {
  body: {
    type: 'object',
    required: ['nom', 'prenom', 'anneeAdhesion'],
    additionalProperties: false,
    properties: membreProperties,
  },
} as const

const updateMembreSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: membreProperties,
  },
} as const

const anneeCourante = (): number => new Date().getFullYear()

/**
 * Règle §4.1 : détermine l'anneeFinContribution à appliquer.
 * - si fournie explicitement → on la conserve ;
 * - sinon, au passage à DECEDE/INACTIF → année courante ;
 * - sinon → undefined (rien à écrire).
 */
function finContributionAuto(body: {
  statut?: StatutMembre
  anneeFinContribution?: number
}): number | undefined {
  if (body.anneeFinContribution !== undefined) return body.anneeFinContribution
  if (body.statut !== undefined && STATUTS_FIN_CONTRIBUTION.includes(body.statut)) {
    return anneeCourante()
  }
  return undefined
}

export const membresRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const perm = (action: 'create' | 'read' | 'update' | 'delete') =>
    requirePermission('Membre', action)

  // GET /membres — liste complète, sauf MEMBRE_SIMPLE (uniquement sa fiche).
  app.get(
    '/membres',
    { preHandler: [authenticate, perm('read')] },
    async (req) => {
      if (req.user.role === 'MEMBRE_SIMPLE') {
        return app.prisma.membre.findMany({
          where: { compteUtilisateurId: req.user.sub ?? '' },
          orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        })
      }
      return app.prisma.membre.findMany({
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      })
    },
  )

  // GET /membres/statuts — liste enrichie du statut de cotisation, calculé EN MASSE
  // (évite le N+1 d'un GET /membres/:id/statut par membre côté front). MEMBRE_SIMPLE :
  // restreint à sa propre fiche, comme GET /membres.
  app.get(
    '/membres/statuts',
    { preHandler: [authenticate, perm('read')] },
    async (req) => {
      const where =
        req.user.role === 'MEMBRE_SIMPLE'
          ? { compteUtilisateurId: req.user.sub ?? '' }
          : undefined
      return calculerStatutsMembres(app.prisma, anneeCourante(), where)
    },
  )

  // GET /membres/:id — un MEMBRE_SIMPLE ne peut voir que sa propre fiche (403 sinon).
  app.get<{ Params: { id: string } }>(
    '/membres/:id',
    { preHandler: [authenticate, perm('read')] },
    async (req, reply) => {
      const membre = await app.prisma.membre.findUnique({
        where: { id: req.params.id },
      })
      if (!membre) {
        return reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'membres.introuvable') })
      }
      if (
        req.user.role === 'MEMBRE_SIMPLE' &&
        membre.compteUtilisateurId !== req.user.sub
      ) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: t(langueDeRequete(req), 'membres.accesLimiteFiche'),
        })
      }
      return membre
    },
  )

  // POST /membres — ADMIN + SECRETAIRE.
  app.post<{ Body: MembreCreateBody }>(
    '/membres',
    { schema: createMembreSchema, preHandler: [authenticate, perm('create')] },
    async (req, reply) => {
      const body = req.body
      const futurCheck = validerAnneeAdhesion(body.anneeAdhesion, reply)
      if (futurCheck) return futurCheck

      // Plafond du plan gratuit (§10.2) : 100 membres par organisation. `count()` est scopé
      // par l'extension d'isolation → compte les membres de l'organisation courante.
      const nbMembres = await app.prisma.membre.count()
      if (nbMembres >= PLAFOND_MEMBRES_PLAN_GRATUIT) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: t(langueDeRequete(req), 'membres.plafondPlanGratuit', {
            plafond: PLAFOND_MEMBRES_PLAN_GRATUIT,
          }),
        })
      }

      // organisationId injecté par l'extension d'isolation (cf. CreationScopee) → non fourni ici.
      const data: CreationScopee<Prisma.MembreUncheckedCreateInput> = {
        nom: body.nom,
        prenom: body.prenom,
        anneeAdhesion: body.anneeAdhesion,
      }
      if (body.sexe !== undefined) data.sexe = body.sexe
      if (body.fonctionSociale !== undefined) data.fonctionSociale = body.fonctionSociale
      if (body.telephone !== undefined) data.telephone = body.telephone
      if (body.adresse !== undefined) data.adresse = body.adresse
      if (body.statut !== undefined) data.statut = body.statut
      if (body.brancheId !== undefined) data.brancheId = body.brancheId
      if (body.chefSousFamilleId !== undefined) data.chefSousFamilleId = body.chefSousFamilleId
      if (body.compteUtilisateurId !== undefined) data.compteUtilisateurId = body.compteUtilisateurId
      if (body.dateNaissance !== undefined) data.dateNaissance = new Date(body.dateNaissance)
      const fin = finContributionAuto(body)
      if (fin !== undefined) data.anneeFinContribution = fin

      const membre = await app.prisma.membre.create({
        data: data as Prisma.MembreUncheckedCreateInput,
      })
      return reply.code(201).send(membre)
    },
  )

  // PATCH /membres/:id — ADMIN + SECRETAIRE.
  app.patch<{ Params: { id: string }; Body: MembreUpdateBody }>(
    '/membres/:id',
    { schema: updateMembreSchema, preHandler: [authenticate, perm('update')] },
    async (req, reply) => {
      const body = req.body
      if (body.anneeAdhesion !== undefined) {
        const futurCheck = validerAnneeAdhesion(body.anneeAdhesion, reply)
        if (futurCheck) return futurCheck
      }

      const data: Prisma.MembreUncheckedUpdateInput = {}
      if (body.nom !== undefined) data.nom = body.nom
      if (body.prenom !== undefined) data.prenom = body.prenom
      if (body.sexe !== undefined) data.sexe = body.sexe
      if (body.fonctionSociale !== undefined) data.fonctionSociale = body.fonctionSociale
      if (body.telephone !== undefined) data.telephone = body.telephone
      if (body.adresse !== undefined) data.adresse = body.adresse
      if (body.statut !== undefined) data.statut = body.statut
      if (body.brancheId !== undefined) data.brancheId = body.brancheId
      if (body.chefSousFamilleId !== undefined) data.chefSousFamilleId = body.chefSousFamilleId
      if (body.compteUtilisateurId !== undefined) data.compteUtilisateurId = body.compteUtilisateurId
      if (body.anneeAdhesion !== undefined) data.anneeAdhesion = body.anneeAdhesion
      if (body.dateNaissance !== undefined) data.dateNaissance = new Date(body.dateNaissance)
      const fin = finContributionAuto(body)
      if (fin !== undefined) data.anneeFinContribution = fin

      try {
        return await app.prisma.membre.update({
          where: { id: req.params.id },
          data,
        })
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: t(langueDeRequete(req), 'membres.introuvable') })
        }
        throw err
      }
    },
  )

  // DELETE /membres/:id — ADMIN uniquement.
  app.delete<{ Params: { id: string } }>(
    '/membres/:id',
    { preHandler: [authenticate, perm('delete')] },
    async (req, reply) => {
      try {
        await app.prisma.membre.delete({ where: { id: req.params.id } })
        return reply.code(204).send()
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          return reply
            .code(404)
            .send({ error: 'Not Found', message: t(langueDeRequete(req), 'membres.introuvable') })
        }
        throw err
      }
    },
  )
}

/** anneeAdhesion ne peut pas être dans le futur. Renvoie une réponse 400 si invalide. */
function validerAnneeAdhesion(
  annee: number,
  reply: FastifyReply,
): FastifyReply | undefined {
  if (annee > anneeCourante()) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: t(langueDeRequete(reply.request), 'membres.anneeAdhesionFuture'),
    })
  }
  return undefined
}

export default membresRoutes
