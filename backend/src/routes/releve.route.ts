import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../middlewares/permissions'
import { calculerStatutsMembres } from '../services/membreStatut.service'
import { genererRelevePdf, type DonneesReleve, type MouvementReleve } from '../services/releve.service'
import {
  resoudreLangueDestinataire,
  resoudreDeviseDestinataire,
} from '../services/notification.service'

/**
 * Relevé de compte membre (§4.8) — proxy authentifié qui génère À LA DEMANDE le PDF « relevé
 * bancaire » des cotisations d'un membre (synthèse + par année + mouvements).
 *
 * Accès (matrice §2, entité « Membre » / read) : rôles bureau ; MEMBRE_SIMPLE UNIQUEMENT sur
 * SA propre fiche (404 sinon — pas de fuite d'existence). Locale + devise = du DESTINATAIRE
 * (le membre), comme les reçus — repli sur le défaut de l'organisation si le membre n'a pas de
 * compte lié. Requête Prisma scopée tenant automatiquement (extension).
 */
export const releveRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Params: { id: string } }>(
    '/membres/:id/releve',
    { preHandler: [authenticate, requirePermission('Membre', 'read')] },
    async (req, reply) => {
      const { id } = req.params
      const annee = new Date().getFullYear()

      // Statut + totaux CUMULÉS : même source de vérité que la fiche membre et la carte.
      const [avecStatut] = await calculerStatutsMembres(app.prisma, annee, { id })
      if (!avecStatut) return reply.code(404).send({ error: 'Not Found' })

      // Fiche + contributions + versements (scopé tenant).
      const membre = await app.prisma.membre.findUnique({
        where: { id },
        select: {
          nom: true,
          prenom: true,
          anneeAdhesion: true,
          compteUtilisateurId: true,
          branche: { select: { nom: true } },
          contributions: {
            orderBy: { annee: 'asc' },
            select: {
              annee: true,
              montantAttendu: true,
              montantVerse: true,
              montantValorise: true,
              versements: {
                orderBy: { dateVersement: 'asc' },
                select: { dateVersement: true, montant: true, mode: true },
              },
            },
          },
        },
      })
      if (!membre) return reply.code(404).send({ error: 'Not Found' })

      // MEMBRE_SIMPLE : seulement SON relevé (indistinguable d'un id inconnu).
      if (req.user.role === 'MEMBRE_SIMPLE' && membre.compteUtilisateurId !== req.user.sub) {
        return reply.code(404).send({ error: 'Not Found' })
      }

      const org = await app.prisma.organisation.findUnique({
        where: { id: req.user.organisationId ?? '' },
        select: { nom: true, langueDefaut: true, devise: true },
      })

      // Locale + devise du DESTINATAIRE (le membre) ; repli sur le défaut de l'org.
      const compteId = membre.compteUtilisateurId
      const langue = compteId
        ? await resoudreLangueDestinataire(app.prisma, compteId)
        : (org?.langueDefaut ?? 'FR')
      const devise = compteId
        ? await resoudreDeviseDestinataire(app.prisma, compteId)
        : (org?.devise ?? 'FCFA')

      // Mouvements = versements aplatis (Contribution → Versement), triés chronologiquement.
      const mouvements: MouvementReleve[] = membre.contributions
        .flatMap((c) =>
          c.versements.map((v) => ({
            date: v.dateVersement,
            annee: c.annee,
            montant: v.montant,
            mode: v.mode,
          })),
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      const donnees: DonneesReleve = {
        organisation: org?.nom ?? 'NKONI',
        nom: membre.nom,
        prenom: membre.prenom,
        branche: membre.branche?.nom ?? null,
        anneeAdhesion: membre.anneeAdhesion,
        statut: avecStatut.statutCotisation,
        totalAttendu: avecStatut.totalAttenduCumule,
        totalValorise: avecStatut.totalValoriseCumule,
        annees: membre.contributions.map((c) => ({
          annee: c.annee,
          attendu: c.montantAttendu,
          verse: c.montantVerse,
          valorise: c.montantValorise,
        })),
        mouvements,
        genereLe: new Date(),
      }

      const pdf = await genererRelevePdf(donnees, langue, devise)
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="releve-${membre.nom}.pdf"`)
      return reply.send(pdf)
    },
  )
}

export default releveRoutes
