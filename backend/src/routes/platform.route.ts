import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireSuperAdmin } from '../middlewares/permissions'
import { orgContext } from '../lib/org-context'
import { t, langueDeRequete } from '../lib/i18n'
import {
  listerOrganisations,
  definirStatutOrganisation,
  definirForfaitOrganisation,
} from '../services/organisation.service'
import { FORFAITS, type Forfait } from '../lib/forfait'
import {
  assemblerExportOrganisation,
  collecterUrlsBlobs,
  supprimerDonneesOrganisation,
  purgerBlobs,
  OrganisationNonSuspendueError,
} from '../services/organisation-purge.service'

/**
 * Routes PLATEFORME (SaaS §2.3) — réservées au rôle transverse SUPER_ADMIN.
 *
 *   GET    /platform/organisations              → liste des organisations clientes
 *   POST   /platform/organisations/:id/suspendre → bloque l'accès (actif = false)
 *   POST   /platform/organisations/:id/reactiver → rétablit l'accès (actif = true)
 *   GET    /platform/organisations/:id/export    → export COMPLET (lecture seule, idempotent)
 *   DELETE /platform/organisations/:id           → purge DÉFINITIVE (double verrou, cf. plus bas)
 *
 * Toutes gardées par `authenticate` + `requireSuperAdmin`. Le super-admin n'ayant PAS de
 * contexte d'organisation (JWT sans claim organisationId), les accès à un modèle scopé
 * (Membre, pour le comptage) sont enveloppés dans `orgContext.runUnscoped` — bypass
 * délibéré et légitime de l'isolation, réservé à ce flux plateforme. Aucune donnée métier
 * (fiches membres, contributions…) n'est exposée : uniquement des métadonnées d'organisation.
 */
export const platformRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const garde = { preHandler: [authenticate, requireSuperAdmin] }

  // GET /platform/organisations — liste + statut + date + nombre de membres.
  app.get('/platform/organisations', garde, async () => {
    const organisations = await orgContext.runUnscoped(async () =>
      listerOrganisations(app.prisma),
    )
    return { organisations }
  })

  // POST /platform/organisations/:id/suspendre — bloque l'accès (§2.3, pas de suppression).
  app.post<{ Params: { id: string } }>(
    '/platform/organisations/:id/suspendre',
    garde,
    async (req, reply) => definirStatut(app, req.params.id, false, reply),
  )

  // POST /platform/organisations/:id/reactiver — rétablit l'accès.
  app.post<{ Params: { id: string } }>(
    '/platform/organisations/:id/reactiver',
    garde,
    async (req, reply) => definirStatut(app, req.params.id, true, reply),
  )

  // GET /platform/organisations/:id/export — export COMPLET des données d'une organisation
  // (bloquant GA 0.3 : portabilité). LECTURE SEULE et IDEMPOTENT : l'opérateur doit pouvoir
  // archiver l'export AVANT de déclencher la purge, et le rejouer si le téléchargement échoue.
  // Renvoie aussi le MANIFESTE des pièces jointes — sans préfixe d'organisation sur les
  // pathnames Blob, c'est la seule table de correspondance permettant de retrouver les fichiers.
  app.get<{ Params: { id: string } }>(
    '/platform/organisations/:id/export',
    garde,
    async (req, reply) => {
      const id = req.params.id
      const donnees = await orgContext.runUnscoped(async () => {
        const org = await app.prisma.organisation.findUnique({ where: { id }, select: { id: true } })
        if (!org) return null
        return await assemblerExportOrganisation(app.prisma, id)
      })
      if (!donnees) {
        return reply.code(404).send({
          error: 'Not Found',
          message: t(langueDeRequete(req), 'platform.organisationIntrouvable'),
        })
      }
      const nomFichier = `export-organisation-${id}-${donnees.genereLe.slice(0, 10)}.json`
      return reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${nomFichier}"`)
        .send(donnees)
    },
  )

  // DELETE /platform/organisations/:id — SUPPRESSION DÉFINITIVE (bloquant GA 0.3 : droit à
  // l'effacement). IRRÉVERSIBLE et non tracée en base (l'AuditLog est per-org et part avec l'org).
  //
  // DOUBLE VERROU, délibéré :
  //   1. l'organisation doit être DÉJÀ SUSPENDUE (`actif = false`) → 409 sinon. Ce n'est pas une
  //      formalité : le scheduler ne balaie que les orgs actives et l'auth refuse login/refresh
  //      sur un espace inactif, donc la suspension est ce qui garantit qu'aucun écrivain
  //      concurrent n'entrera en conflit avec la transaction de purge ;
  //   2. le corps doit porter `confirmationNom` égal EXACTEMENT au nom de l'organisation → 400
  //      sinon. Un DELETE par UUID nu n'offre aucune marge sur une erreur d'identifiant, et
  //      l'opération ne se rattrape pas (motif « frappez le nom du dépôt » de GitHub).
  //
  // ORDRE : base d'abord (une seule transaction), blobs ENSUITE. Cf. `collecterUrlsBlobs` pour
  // le raisonnement — les URLs vivent dans l'export, donc un blob non supprimé reste rejouable,
  // alors que l'ordre inverse laisserait un tenant vivant aux fichiers morts (Document.url est
  // NOT NULL, l'état « document sans fichier » n'existe pas).
  app.delete<{ Params: { id: string }; Body: { confirmationNom: string } }>(
    '/platform/organisations/:id',
    {
      ...garde,
      schema: {
        body: {
          type: 'object',
          required: ['confirmationNom'],
          additionalProperties: false,
          properties: { confirmationNom: { type: 'string', minLength: 1, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const id = req.params.id
      const langue = langueDeRequete(req)

      const issue = await orgContext.runUnscoped(async () => {
        const org = await app.prisma.organisation.findUnique({
          where: { id },
          select: { id: true, nom: true, actif: true },
        })
        if (!org) return { statut: 404 as const }
        if (org.actif !== false) return { statut: 409 as const }
        if (org.nom !== req.body.confirmationNom) return { statut: 400 as const }

        // L'export est produit AVANT la purge : il porte les URLs des blobs, donc il est ce qui
        // rend la suppression des fichiers rejouable en cas d'échec partiel.
        const exportComplet = await assemblerExportOrganisation(app.prisma, id)
        const urls = collecterUrlsBlobs(exportComplet)

        // Les ids d'utilisateurs sont collectés ICI, avant la transaction : `RefreshToken` n'a
        // aucune FK vers `Utilisateur`, ses lignes seraient introuvables une fois ceux-ci purgés.
        const utilisateurIds = (exportComplet.donnees['Utilisateur'] ?? []).map(
          (u) => (u as { id: string }).id,
        )

        // Timeout large : le défaut Prisma (5 s) est très insuffisant sur un tenant réel et
        // échouerait en P2028 opaque, à mi-parcours d'une purge non rejouable.
        let compteurs: Record<string, number>
        try {
          compteurs = await app.prisma.$transaction(
            (tx) => supprimerDonneesOrganisation(tx, id, utilisateurIds),
            { timeout: 120_000, maxWait: 15_000 },
          )
        } catch (err) {
          // Le service RELIT la précondition dans la transaction : un `/reactiver` concurrent,
          // arrivé entre le contrôle ci-dessus et le commit, se rattrape ici — en 409 explicite
          // et non en 500 (la transaction a été annulée, rien n'a été supprimé).
          if (err instanceof OrganisationNonSuspendueError) return { statut: 409 as const }
          throw err
        }

        // APRÈS le commit : les données sont parties, un échec de blob ne peut plus rien annuler.
        const blobs = await purgerBlobs(app.blob, urls)

        return { statut: 200 as const, org, compteurs, blobs, exportComplet }
      })

      if (issue.statut === 404) {
        return reply.code(404).send({
          error: 'Not Found',
          message: t(langue, 'platform.organisationIntrouvable'),
        })
      }
      if (issue.statut === 409) {
        return reply.code(409).send({
          error: 'Conflict',
          message: t(langue, 'platform.organisationNonSuspendue'),
        })
      }
      if (issue.statut === 400) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: t(langue, 'platform.confirmationInvalide'),
        })
      }

      // TRACE HORS BASE — obligatoire : l'AuditLog de l'organisation vient d'être supprimé avec
      // elle, cette purge n'est donc journalisée NULLE PART ailleurs. (Une table
      // `PlatformAuditLog` non scopée serait la vraie réponse : dette assumée.)
      app.log.warn(
        {
          organisationId: id,
          nom: issue.org.nom,
          acteurId: req.user.sub,
          compteurs: issue.compteurs,
          blobsSupprimes: issue.blobs.supprimes,
          blobsEchoues: issue.blobs.echecs,
        },
        'Purge définitive d’une organisation',
      )
      if (issue.blobs.echecs.length > 0) {
        app.observabilite.signaler(
          new Error(`Purge organisation ${id} : ${issue.blobs.echecs.length} blob(s) non supprimé(s)`),
          { source: 'platform', operation: 'purge-organisation', organisationId: id },
        )
      }

      return reply.code(200).send({
        supprimee: true,
        compteurs: issue.compteurs,
        blobs: issue.blobs,
        export: issue.exportComplet,
      })
    },
  )

  // PATCH /platform/organisations/:id/forfait — attribue un forfait (SaaS §3.1). Activation
  // MANUELLE réservée au SUPER_ADMIN (pas de paiement). Le forfait borne la limite de membres
  // (cf. lib/forfait) dès le prochain contrôle de quota. 404 si l'id est inconnu.
  app.patch<{ Params: { id: string }; Body: { forfait: Forfait } }>(
    '/platform/organisations/:id/forfait',
    {
      ...garde,
      schema: {
        body: {
          type: 'object',
          required: ['forfait'],
          additionalProperties: false,
          properties: { forfait: { type: 'string', enum: [...FORFAITS] } },
        },
      },
    },
    async (req, reply) => {
      try {
        const organisation = await orgContext.runUnscoped(async () =>
          definirForfaitOrganisation(app.prisma, req.params.id, req.body.forfait),
        )
        return { organisation }
      } catch (err) {
        if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2025') {
          return reply.code(404).send({
            error: 'Not Found',
            message: t(langueDeRequete(reply.request), 'platform.organisationIntrouvable'),
          })
        }
        throw err
      }
    },
  )
}

/**
 * Applique le changement de statut d'une organisation et gère le 404 (id inconnu → P2025).
 * Enveloppé dans `runUnscoped` par cohérence, bien qu'`Organisation` ne soit pas un modèle
 * scopé (défense en profondeur si la liste des modèles scopés évoluait).
 */
async function definirStatut(
  app: FastifyInstance,
  id: string,
  actif: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply: any,
): Promise<unknown> {
  try {
    const organisation = await orgContext.runUnscoped(async () =>
      definirStatutOrganisation(app.prisma, id, actif),
    )
    return { organisation }
  } catch (err) {
    // P2025 : id d'organisation inconnu → 404 (pas de fuite d'existence).
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2025') {
      return reply
        .code(404)
        .send({
          error: 'Not Found',
          message: t(langueDeRequete(reply.request), 'platform.organisationIntrouvable'),
        })
    }
    throw err
  }
}

export default platformRoutes
