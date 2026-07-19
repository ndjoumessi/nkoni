import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { calculerStatutContribution } from '../services/statutContribution'
import { t, langueDeRequete } from '../lib/i18n'
import { anneeCouranteApp } from '../lib/date-app'

/**
 * Espace membre SELF-SERVICE (§5) — routes scopées au MEMBRE connecté, HORS matrice de
 * permissions (sur le modèle de `/auth/me`). Chaque route résout le Membre via
 * `req.user.sub` → `Membre.compteUtilisateurId` et ne renvoie JAMAIS les données d'un autre
 * membre (le filtre `membreId`/`compteUtilisateurId` garantit l'isolation, en plus du scope org).
 *
 * Sans Membre lié (ex. un ADMIN sans fiche) : `/moi/situation` → 404 propre ; les listes → [].
 */

const anneeCourante = (): number => anneeCouranteApp()

/** Résout le Membre lié au compte connecté (ou null). `findFirst` → organisationId injecté (scopé). */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function membreConnecte(prisma: any, sub: string | undefined) {
  if (!sub) return null
  return prisma.membre.findFirst({ where: { compteUtilisateurId: sub } })
}

export const moiRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /moi/situation — synthèse : identité, statut, cotisation (dû / versé).
  app.get('/moi/situation', { preHandler: [authenticate] }, async (req, reply) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) {
      return reply
        .code(404)
        .send({ error: 'Not Found', message: t(langueDeRequete(req), 'monEspace.aucuneFiche') })
    }

    const [baremes, contributions, branche] = await Promise.all([
      app.prisma.baremeAnnuel.findMany({ select: { annee: true, montantAttendu: true } }),
      app.prisma.contribution.findMany({
        where: { membreId: membre.id },
        select: { annee: true, montantValorise: true, montantVerse: true },
      }),
      membre.brancheId
        ? app.prisma.brancheFamiliale.findFirst({
            where: { id: membre.brancheId },
            select: { nom: true },
          })
        : Promise.resolve(null),
    ])

    const statut = calculerStatutContribution({
      baremes,
      contributions: contributions.map((c) => ({ annee: c.annee, montantValorise: c.montantValorise })),
      anneeAdhesion: membre.anneeAdhesion,
      anneeFinContribution: membre.anneeFinContribution,
      anneeCourante: anneeCourante(),
    })
    const totalVerse = contributions.reduce((s, c) => s + c.montantVerse, 0)

    return {
      membre: {
        nom: membre.nom,
        prenom: membre.prenom,
        branche: branche?.nom ?? null,
        statut: membre.statut,
        anneeAdhesion: membre.anneeAdhesion,
      },
      cotisation: {
        statut: statut.statut,
        totalDu: statut.totalAttenduCumule,
        totalVerse,
      },
    }
  })

  // GET /moi/contributions — historique de SES contributions + versements.
  app.get('/moi/contributions', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    return app.prisma.contribution.findMany({
      where: { membreId: membre.id },
      orderBy: { annee: 'desc' },
      select: {
        id: true,
        annee: true,
        montantAttendu: true,
        montantVerse: true,
        montantValorise: true,
        versements: {
          orderBy: { dateVersement: 'desc' },
          select: { id: true, montant: true, dateVersement: true, mode: true },
        },
      },
    })
  })

  // GET /moi/reunions — réunions À VENIR de son organisation (info collective ; membre lié requis).
  app.get('/moi/reunions', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    const debutJour = new Date()
    debutJour.setHours(0, 0, 0, 0)
    return app.prisma.reunion.findMany({
      where: { date: { gte: debutJour }, statut: { not: 'ANNULEE' } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, lieu: true, type: true, statut: true },
    })
  })

  // GET /moi/recus — SES reçus (numéro, date, montant du versement, disponibilité du PDF).
  app.get('/moi/recus', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    // Reçus rattachés aux versements de SES contributions (Recu → Versement → Contribution → Membre).
    const versements = await app.prisma.versement.findMany({
      where: { contribution: { membreId: membre.id } },
      select: { id: true, montant: true },
    })
    const montantParVersement = new Map<string, number>(versements.map((v) => [v.id, v.montant]))
    const recus = await app.prisma.recu.findMany({
      where: { versementId: { in: [...montantParVersement.keys()] } },
      orderBy: { dateGeneration: 'desc' },
      select: { id: true, numero: true, dateGeneration: true, versementId: true, urlPdf: true },
    })
    return recus.map((r) => ({
      id: r.id,
      numero: r.numero,
      date: r.dateGeneration,
      montant: montantParVersement.get(r.versementId) ?? 0,
      // Le PDF est produit À LA DEMANDE par GET /recus/:id/pdf (généré si urlPdf null) → toujours
      // téléchargeable. Le champ reste exposé pour un éventuel gate futur côté UI.
      telechargeable: true,
    }))
  })
}

export default moiRoutes
