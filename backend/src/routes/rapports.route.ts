import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { t, langueDeRequete } from '../lib/i18n'
import {
  chargerDonneesRapport,
  genererRapportFinancier,
  comparerPeriodes,
  comparerPeriodesMulti,
} from '../services/rapport.service'
import {
  genererEvolutionExcel,
  genererEvolutionPdf,
  genererComparaisonExcel,
  genererComparaisonPdf,
  genererComparaisonMultiExcel,
  genererComparaisonMultiPdf,
} from '../services/export-rapport.service'
import { assemblerDonneesContributions } from '../services/export.service'
import { resoudreLocaleExport } from '../lib/export-locale'
import {
  calculerStatutContribution,
  type StatutContributionValue,
} from '../services/statutContribution'

/**
 * Rapports financiers (enrichissement) — agrégations PAR ANNÉE des données existantes.
 *
 * Permissions : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES → autorisés ;
 * SECRETAIRE, MEMBRE_SIMPLE, GUIDE_RELIGIEUX → 403. On réutilise l'entité `Export`
 * (action `read`) dont la matrice §2 donne EXACTEMENT cet ensemble de rôles — cohérent
 * avec l'accès « lecture du module financier » déjà en place.
 *
 *   GET /rapports/financier?anneeDebut=&anneeFin=  → rapport multi-années
 *   GET /rapports/comparaison?anneeA=&anneeB=      → comparaison de deux années
 */

const ANNEE = { type: 'integer', minimum: 1900, maximum: 2200 } as const
/** Liste d'années séparée par des virgules, au moins deux (ex. « 2022,2023,2024 »). */
const ANNEES_LISTE = { type: 'string', pattern: '^[0-9]{4}(,[0-9]{4})+$' } as const

const financierSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['anneeDebut', 'anneeFin'],
    properties: { anneeDebut: ANNEE, anneeFin: ANNEE },
  },
} as const

// Comparaison : soit l'ancien format (anneeA & anneeB), soit `annees=` (multi). La
// validation « l'un ou l'autre » est faite dans le handler (schéma volontairement souple).
const comparaisonSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { anneeA: ANNEE, anneeB: ANNEE, annees: ANNEES_LISTE },
  },
} as const

const FORMAT = { type: 'string', enum: ['xlsx', 'pdf'], default: 'xlsx' } as const

/**
 * Parse et valide une liste d'années « 2022,2023,2024 » : au moins 2 années, chacune
 * dans [1900, 2200]. Retourne `null` si invalide. L'ordre fourni est conservé (la chaîne
 * de variations suit l'ordre de la liste).
 */
function parseAnnees(brut: string): number[] | null {
  const annees = brut.split(',').map((s) => Number(s))
  if (annees.length < 2) return null
  if (annees.some((n) => !Number.isInteger(n) || n < 1900 || n > 2200)) return null
  return annees
}

const financierExportSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['anneeDebut', 'anneeFin'],
    properties: { anneeDebut: ANNEE, anneeFin: ANNEE, format: FORMAT },
  },
} as const

const comparaisonExportSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { anneeA: ANNEE, anneeB: ANNEE, annees: ANNEES_LISTE, format: FORMAT },
  },
} as const

const detailMembresSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['annee'],
    properties: { annee: ANNEE },
  },
} as const

/**
 * Statut de contribution d'une ligne, calculé en fenêtre MONO-ANNÉE : on réutilise la fonction
 * canonique `calculerStatutContribution` (§4.1) avec une borne d'un seul an → mêmes seuils
 * (valorisé ≥ attendu → À jour ; valorisé == 0 → non à jour ; sinon partiel) que partout ailleurs
 * dans l'app, sans dupliquer la logique. Volontairement mono-année : ce tableau montre les montants
 * d'UNE année, le badge reflète donc le statut de CETTE année (≠ statut cumulé de la fiche membre).
 */
function statutMonoAnnee(
  annee: number,
  montantAttendu: number,
  montantValorise: number,
): StatutContributionValue {
  return calculerStatutContribution({
    baremes: [{ annee, montantAttendu }],
    contributions: [{ annee, montantValorise }],
    anneeAdhesion: annee,
    anneeCourante: annee,
  }).statut
}

const CONTENT_TYPE = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const

export const rapportsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Querystring: { anneeDebut: number; anneeFin: number } }>(
    '/rapports/financier',
    { schema: financierSchema, preHandler: [authenticate, requirePermission('Export', 'read')] },
    async (req, reply) => {
      const { anneeDebut, anneeFin } = req.query
      if (anneeDebut > anneeFin) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: t(langueDeRequete(req), 'rapports.anneeDebutApresFin'),
        })
      }
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)
      return genererRapportFinancier(anneeDebut, anneeFin, baremes, membres)
    },
  )

  app.get<{ Querystring: { anneeA?: number; anneeB?: number; annees?: string } }>(
    '/rapports/comparaison',
    { schema: comparaisonSchema, preHandler: [authenticate, requirePermission('Export', 'read')] },
    async (req, reply) => {
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)

      // Nouveau format multi-années.
      if (req.query.annees !== undefined) {
        const annees = parseAnnees(req.query.annees)
        if (!annees) {
          return reply
            .code(400)
            .send({ error: 'Bad Request', message: t(langueDeRequete(req), 'rapports.comparaisonInvalide') })
        }
        return comparerPeriodesMulti(annees, baremes, membres)
      }
      // Rétrocompatibilité : paire A / B.
      if (req.query.anneeA !== undefined && req.query.anneeB !== undefined) {
        return comparerPeriodes(req.query.anneeA, req.query.anneeB, baremes, membres)
      }
      return reply
        .code(400)
        .send({ error: 'Bad Request', message: t(langueDeRequete(req), 'rapports.comparaisonInvalide') })
    },
  )

  /* --- Détail par membre (consultation JSON, §5.9) ---------------------- */

  // Tableau consultable des contributions par membre pour UNE année. MÊME source de données que
  // l'export Excel/PDF (`assemblerDonneesContributions`) — aucune requête dupliquée : on ne fait
  // qu'ajouter le statut dérivé par ligne. « Ce qu'on voit = ce qu'on exporte ».
  app.get<{ Querystring: { annee: number } }>(
    '/rapports/detail-membres',
    { schema: detailMembresSchema, preHandler: [authenticate, requirePermission('Export', 'read')] },
    async (req) => {
      const { annee } = req.query
      const donnees = await assemblerDonneesContributions(app.prisma, { annee })
      return {
        annee,
        genereLe: donnees.genereLe.toISOString(),
        lignes: donnees.lignes.map((l) => ({
          membreId: l.membreId,
          nom: l.nom,
          prenom: l.prenom,
          montantAttendu: l.montantAttendu,
          montantVerse: l.montantVerse,
          montantValorise: l.montantValorise,
          statut: statutMonoAnnee(l.annee, l.montantAttendu, l.montantValorise),
        })),
        totaux: donnees.totaux,
      }
    },
  )

  /* --- Exports PDF / Excel ---------------------------------------------- */

  app.get<{ Querystring: { anneeDebut: number; anneeFin: number; format?: 'xlsx' | 'pdf' } }>(
    '/rapports/financier/export',
    {
      schema: financierExportSchema,
      preHandler: [authenticate, requirePermission('Export', 'read')],
    },
    async (req, reply) => {
      const { anneeDebut, anneeFin } = req.query
      const format = req.query.format ?? 'xlsx'
      if (anneeDebut > anneeFin) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: t(langueDeRequete(req), 'rapports.anneeDebutApresFin'),
        })
      }
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)
      const rapport = genererRapportFinancier(anneeDebut, anneeFin, baremes, membres)

      // Langue/devise de l'exporteur ; devise résolue seulement pour le PDF (l'Excel garde des nombres).
      const { langue, devise } = await resoudreLocaleExport(req, app.prisma, format === 'pdf')

      const nomFichier = `rapport-financier-${anneeDebut}-${anneeFin}.${format}`
      const buffer =
        format === 'pdf'
          ? await genererEvolutionPdf(rapport, new Date(), langue, devise)
          : await genererEvolutionExcel(rapport)

      return reply
        .header('Content-Type', CONTENT_TYPE[format])
        .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
        .send(buffer)
    },
  )

  app.get<{
    Querystring: { anneeA?: number; anneeB?: number; annees?: string; format?: 'xlsx' | 'pdf' }
  }>(
    '/rapports/comparaison/export',
    {
      schema: comparaisonExportSchema,
      preHandler: [authenticate, requirePermission('Export', 'read')],
    },
    async (req, reply) => {
      const format = req.query.format ?? 'xlsx'
      const { baremes, membres } = await chargerDonneesRapport(app.prisma)

      // Langue/devise de l'exporteur ; devise résolue seulement pour le PDF (l'Excel garde des nombres).
      const { langue, devise } = await resoudreLocaleExport(req, app.prisma, format === 'pdf')

      let buffer: Buffer
      let nomFichier: string

      if (req.query.annees !== undefined) {
        // Nouveau format multi-années.
        const annees = parseAnnees(req.query.annees)
        if (!annees) {
          return reply
            .code(400)
            .send({ error: 'Bad Request', message: t(langueDeRequete(req), 'rapports.comparaisonInvalide') })
        }
        const comparaison = comparerPeriodesMulti(annees, baremes, membres)
        nomFichier = `comparaison-${annees.join('-')}.${format}`
        buffer =
          format === 'pdf'
            ? await genererComparaisonMultiPdf(comparaison, new Date(), langue, devise)
            : await genererComparaisonMultiExcel(comparaison)
      } else if (req.query.anneeA !== undefined && req.query.anneeB !== undefined) {
        // Rétrocompatibilité : paire A / B.
        const comparaison = comparerPeriodes(req.query.anneeA, req.query.anneeB, baremes, membres)
        nomFichier = `comparaison-${req.query.anneeA}-${req.query.anneeB}.${format}`
        buffer =
          format === 'pdf'
            ? await genererComparaisonPdf(comparaison, new Date(), langue, devise)
            : await genererComparaisonExcel(comparaison)
      } else {
        return reply
          .code(400)
          .send({ error: 'Bad Request', message: t(langueDeRequete(req), 'rapports.comparaisonInvalide') })
      }

      return reply
        .header('Content-Type', CONTENT_TYPE[format])
        .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
        .send(buffer)
    },
  )
}

export default rapportsRoutes
