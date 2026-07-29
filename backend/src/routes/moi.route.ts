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
    const reunions = await app.prisma.reunion.findMany({
      where: { date: { gte: debutJour }, statut: { not: 'ANNULEE' } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, lieu: true, type: true, statut: true },
    })
    if (reunions.length === 0) return []
    // Statut RSVP du membre pour chacune (nouveau modèle → surface souple compile-avant-regen).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presences = (await (app.prisma.presenceReunion as any).findMany({
      where: { membreId: membre.id, reunionId: { in: reunions.map((r) => r.id) } },
      select: { reunionId: true, statut: true },
    })) as { reunionId: string; statut: string }[]
    const parReunion = new Map(presences.map((p) => [p.reunionId, p.statut]))
    return reunions.map((r) => ({ ...r, monStatut: parReunion.get(r.id) ?? null }))
  })

  // GET /moi/resolutions — résolutions OUVERTES au vote (`dateVote` null) de son organisation, avec
  // le sens déjà exprimé par le membre s'il y en a un. « Votes en cours » de l'espace membre.
  app.get('/moi/resolutions', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    const resolutions = await app.prisma.resolution.findMany({
      // Seules les résolutions EXPLICITEMENT mises au vote et non encore clôturées. Le défaut
      // `ouvertAuVote: false` exclut les résolutions documentaires (résultat déjà acté).
      where: { ouvertAuVote: true, dateVote: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, texte: true, reunion: { select: { date: true, lieu: true } } },
    })
    if (resolutions.length === 0) return []
    // Sens déjà voté par CE membre (nouveau modèle → surface souple compile-avant-regen).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const votes = (await (app.prisma.vote as any).findMany({
      where: { membreId: membre.id, resolutionId: { in: resolutions.map((r) => r.id) } },
      select: { resolutionId: true, sens: true },
    })) as { resolutionId: string; sens: string }[]
    const parResolution = new Map(votes.map((v) => [v.resolutionId, v.sens]))
    return resolutions.map((r) => ({
      id: r.id,
      texte: r.texte,
      reunionDate: r.reunion.date,
      reunionLieu: r.reunion.lieu,
      monVote: parResolution.get(r.id) ?? null,
    }))
  })

  // GET /moi/recus — SES reçus (numéro, date, montant du versement, disponibilité du PDF).
  app.get('/moi/recus', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    // Lecture DIRECTE par membre : `Recu.membreId` est dénormalisé depuis la migration
    // `recu_orphelin_snapshot_membre`. Remplace le détour Versement → Contribution → Membre (2
    // requêtes + une Map intermédiaire) et, surtout, atteint les reçus ORPHELINS — l'ancien
    // `versementId: { in: [...] }` ne matchait JAMAIS un `versementId` NULL.
    const recus = await app.prisma.recu.findMany({
      where: { membreId: membre.id },
      orderBy: { dateGeneration: 'desc' },
      select: { id: true, numero: true, dateGeneration: true, montant: true, annuleLe: true },
    })
    return recus.map((r) => ({
      id: r.id,
      numero: r.numero,
      date: r.dateGeneration,
      // Montant FIGÉ à l'émission, et non le montant vivant du versement. Correction de fond :
      // après « annuler → corriger le montant », cette ligne affichait le NOUVEAU montant, qui
      // contredisait le PDF que le membre avait en main.
      montant: r.montant,
      annuleLe: r.annuleLe,
      // `true` en dur auparavant — or un reçu ANNULÉ est refusé par GET /recus/:id/pdf (409). On
      // envoyait donc le membre au-devant d'une erreur.
      telechargeable: r.annuleLe === null,
    }))
  })

  // GET /moi/amendes — SES amendes (§4.10), lecture seule. Montant, motif, statut (impayée/payée/
  // annulée). Le membre voit ce qu'il doit ; la SAISIE et l'encaissement restent au bureau.
  app.get('/moi/amendes', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (app.prisma.amende as any).findMany({
      where: { membreId: membre.id },
      orderBy: { dateAmende: 'desc' },
      select: {
        id: true,
        type: true,
        motif: true,
        montant: true,
        dateAmende: true,
        statut: true,
        datePaiement: true,
      },
    })
  })

  // GET /moi/cagnottes — cagnottes OUVERTES (§4.9) + ce que CE membre y a donné. Transparence :
  // on montre la collecte collective (Σ dons) et le don personnel. Lecture seule (le membre ne gère
  // pas la cagnotte). Somme calculée en JS sur un findMany (couvert par l'extension d'isolation) —
  // pas de groupBy/aggregate sur un modèle scopé (non garanti couvert → risque OperationNonIsolee).
  app.get('/moi/cagnottes', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cagnottes = (await (app.prisma.cagnotteEvenement as any).findMany({
      where: { statut: 'OUVERTE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, titre: true, type: true, objectif: true, dateEvenement: true },
    })) as { id: string; titre: string; type: string; objectif: number | null; dateEvenement: Date | null }[]
    if (cagnottes.length === 0) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dons = (await (app.prisma.donCagnotte as any).findMany({
      where: { cagnotteId: { in: cagnottes.map((c) => c.id) } },
      select: { cagnotteId: true, montant: true, membreId: true },
    })) as { cagnotteId: string; montant: number; membreId: string }[]
    return cagnottes.map((c) => {
      const siennes = dons.filter((d) => d.cagnotteId === c.id)
      return {
        id: c.id,
        titre: c.titre,
        type: c.type,
        objectif: c.objectif,
        dateEvenement: c.dateEvenement,
        collecteTotal: siennes.reduce((s, d) => s + d.montant, 0),
        monDon: siennes.filter((d) => d.membreId === membre.id).reduce((s, d) => s + d.montant, 0),
      }
    })
  })

  // GET /moi/tontines — MES participations (§ tontine), lecture seule. Par cycle : mon rang de
  // rotation, ma mise due (parts × mise de base), et par tour : suis-je le bénéficiaire, ma mise
  // est-elle payée. Vue « où j'en suis dans la tontine ». L'ENREGISTREMENT des mises reste au trésorier.
  app.get('/moi/tontines', { preHandler: [authenticate] }, async (req) => {
    const membre = await membreConnecte(app.prisma, req.user.sub)
    if (!membre) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const participations = (await (app.prisma.participationTontine as any).findMany({
      where: { membreId: membre.id },
      orderBy: { createdAt: 'desc' },
      select: {
        parts: true,
        ordre: true,
        cycle: {
          select: {
            numero: true,
            statut: true,
            tontine: { select: { nom: true, montantBaseMise: true, modeRotation: true } },
            tours: {
              orderBy: { numero: 'asc' },
              select: {
                numero: true,
                beneficiaireId: true,
                montantPot: true,
                statut: true,
                // Filtré sur MA mise uniquement (nested where dans le select — pas une opération à part).
                mises: { where: { membreId: membre.id }, select: { montant: true } },
              },
            },
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any[]
    return participations.map((p) => {
      const miseDue = p.parts * p.cycle.tontine.montantBaseMise
      return {
        tontineNom: p.cycle.tontine.nom,
        modeRotation: p.cycle.tontine.modeRotation,
        cycleNumero: p.cycle.numero,
        cycleStatut: p.cycle.statut,
        maParts: p.parts,
        monOrdre: p.ordre,
        miseDue,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tours: p.cycle.tours.map((t: any) => ({
          numero: t.numero,
          statut: t.statut,
          jeSuisBeneficiaire: t.beneficiaireId === membre.id,
          maMisePayee: t.mises.length > 0,
          // Pot RÉEL seulement une fois reversé (figé) ; sinon null (le front affiche la mise due).
          montantPot: t.statut === 'REVERSE' ? t.montantPot : null,
        })),
      }
    })
  })
}

export default moiRoutes
