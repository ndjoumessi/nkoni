import { randomBytes, randomUUID } from 'node:crypto'
import { auditContext } from '../lib/audit-context'
import { orgContext } from '../lib/org-context'
import { anneeCouranteApp } from '../lib/date-app'
import { definirChefOrganisation, inscrireOrganisation } from './organisation.service'
import { ouvrirAnnee } from './contribution.service'
import { appliquerCreationVersement } from './versement.service'
import { annulerRecu, genererRecu } from './recu.service'
import { validerTransition, type StatutDepense } from './tresorerie.service'
import { validerTransitionAmende } from './amende.service'
import { creerTontine, enregistrerMise, ouvrirCycle, reverserTour } from './tontine.service'
import { creerReunion } from './reunion.service'
import { creerResolution } from './resolution.service'
import { cloturerResolution, ouvrirVoteResolution, voterResolution } from './vote.service'
import { creerFonction } from './fonction.service'
import { creerAffectation } from './affectation.service'
import { supprimerOrganisationDemo } from './demo-suppression.service'
import type { BlobPurgeClient } from './organisation-purge.service'
import {
  BRANCHES_DEMO,
  DEPENSES_DEMO,
  NOM_ORGANISATION_DEMO,
  baremesDemo,
  construireMembresDemo,
  planifierVersementsDemo,
} from './demo-donnees'

/**
 * Espace de démonstration (spec 2026-09-15 §3.1) — génération d'une organisation fictive complète.
 *
 * PAR LES SERVICES RÉELS (versements, reçus, tontine, votes…), jamais par insertions brutes là où un
 * service porte un invariant : cumuls de contribution, numérotation des reçus, un reçu actif par
 * versement. Seules les entités dont la création vit dans une route (branches, membres, barèmes,
 * dépenses, cagnotte, amendes, présences) sont écrites directement, avec les règles de ces routes.
 *
 * Trois propriétés, dans cet ordre :
 *  1. Invisible pendant le remplissage : l'organisation est marquée `estDemo: true, actif: false`
 *     (`chargerCompteDemo` n'ouvre que les démos actives ; les tâches de fond ignorent les démos), puis
 *     activée à la toute fin.
 *  2. Rien n'est envoyé : aucune notification, aucun envoi de reçu, aucun paiement en ligne — ces envois
 *     vivent dans les routes, le générateur ne les appelle jamais.
 *  3. Pas de reste : toute erreur supprime l'organisation partielle avant de remonter (la console refuse
 *     de supprimer une démo, et la régénération ne supprime que les démos plus anciennes).
 *
 * Écritures métier sous `auditContext.run` (acteur = compte ADMIN de la démo) + `orgContext.run`.
 */

export interface VolumesDemo {
  membres: number
  versements: number
  recus: number
  recusAnnules: number
  depenses: number
  dons: number
  amendes: number
  misesTontine: number
  votes: number
}

export interface OrganisationDemoGeneree {
  organisationId: string
  adminId: string
  volumes: VolumesDemo
}

const JOUR_MS = 24 * 60 * 60 * 1000

export async function genererOrganisationDemo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  blob: BlobPurgeClient,
  now: Date = new Date(),
): Promise<OrganisationDemoGeneree> {
  // Création hors tenant (aucune organisation n'existe encore) — même chemin que l'auto-inscription.
  // E-mail en `.invalid` (TLD réservé, jamais délivrable) et mot de passe aléatoire jamais conservé :
  // la connexion par mot de passe est de toute façon refusée pour un compte de démo.
  const admin = await orgContext.runUnscoped(
    async () =>
      await inscrireOrganisation(prisma, {
        nomOrganisation: NOM_ORGANISATION_DEMO,
        devise: 'FCFA',
        langue: 'FR',
        email: `demo-${randomUUID()}@demo.nkoni.invalid`,
        password: randomBytes(24).toString('base64url'),
      }),
  )
  const organisationId = admin.organisationId as string
  try {
    await prisma.organisation.update({
      where: { id: organisationId },
      data: { estDemo: true, actif: false, forfait: 'PRO' },
    })
    const volumes = await auditContext.run({ acteurId: admin.id }, () =>
      orgContext.run({ organisationId }, async () => await remplir(prisma, organisationId, admin.id, now)),
    )
    await prisma.organisation.update({ where: { id: organisationId }, data: { actif: true } })
    return { organisationId, adminId: admin.id, volumes }
  } catch (err) {
    // Voie PRINCIPALE : `supprimerOrganisationDemo` gère toute panne survenue APRÈS le marquage
    // `estDemo: true` (l'organisation a alors des données à purger dans l'ordre, base puis blobs).
    const resultat = await supprimerOrganisationDemo(prisma, blob, organisationId).catch(() => undefined)
    // FENÊTRE ÉTROITE : si le tout premier `organisation.update` (celui qui pose `estDemo: true`)
    // échoue lui-même, l'organisation existe encore mais `estDemo` vaut toujours `false` (valeur par
    // défaut du schéma) — `supprimerOrganisationDemo` la relit, la trouve non-démo par construction et
    // refuse (`OrganisationNonDemoError`, capturé ci-dessus). Sans repli, l'organisation ET son compte
    // ADMIN fondateur (créés par `inscrireOrganisation`, juste avant le `try`) survivraient
    // indéfiniment, indiscernables d'une organisation réelle auto-inscrite : rien (régénération,
    // suppression de démo, tâches de fond) n'irait jamais les nettoyer. Repli SÛR PAR CONSTRUCTION :
    // ne supprime que si l'organisation est encore VIDE (aucune donnée métier) — jamais une
    // organisation qui contiendrait déjà des données par cette voie.
    if (!resultat || resultat.supprimee !== true) {
      await nettoyerOrganisationPartielle(prisma, organisationId).catch(() => undefined)
    }
    throw err
  }
}

/**
 * Repli de nettoyage pour la fenêtre où le TOUT PREMIER `organisation.update` (marquage `estDemo`)
 * échoue avant même d'avoir posé `estDemo: true` — `supprimerOrganisationDemo` refuse alors
 * systématiquement (`OrganisationNonDemoError`), puisqu'il exige `estDemo: true` par construction.
 *
 * SÛR PAR CONSTRUCTION : vérifie d'abord que l'organisation est encore VIDE (aucun membre, aucun
 * versement) avant de supprimer quoi que ce soit ; sinon ne touche à rien et laisse l'erreur d'origine
 * remonter seule (mieux vaut une organisation orpheline visible qu'une perte de données silencieuse).
 * `inscrireOrganisation` ne crée qu'`Organisation` + `Utilisateur` (aucune session émise, donc aucun
 * `RefreshToken`) : rien d'autre à purger à ce stade.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nettoyerOrganisationPartielle(prisma: any, organisationId: string): Promise<void> {
  await orgContext.runUnscoped(async () => {
    const [membres, versements] = await Promise.all([
      prisma.membre.count({ where: { organisationId } }),
      prisma.versement.count({ where: { organisationId } }),
    ])
    if (membres > 0 || versements > 0) return // pas vide : ne jamais supprimer par cette voie.
    await prisma.utilisateur.deleteMany({ where: { organisationId } })
    await prisma.organisation.delete({ where: { id: organisationId } })
  })
}

/**
 * Contexte partagé par les étapes du remplissage. Les étapes s'exécutent dans un ORDRE FIXE (voir
 * `remplir`) : la numérotation des reçus suit l'ordre des versements, et les étapes suivantes
 * s'appuient sur les membres et contributions créés avant elles.
 */
interface ContexteRemplissage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any
  organisationId: string
  adminId: string
  now: Date
  annee: number
  ilYA: (jours: number) => Date
  membres: MembreDemo[]
  actifs: MembreDemo[]
  /** Identifiant en base d'un membre de la description (par sa clé stable). */
  id: (cle: string) => string
}

type MembreDemo = ReturnType<typeof construireMembresDemo>[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function remplir(prisma: any, organisationId: string, adminId: string, now: Date): Promise<VolumesDemo> {
  const annee = anneeCouranteApp(now)
  const membres = construireMembresDemo(annee)
  const idDe = await creerBranchesEtMembres(prisma, membres, annee)
  const ctx: ContexteRemplissage = {
    prisma,
    organisationId,
    adminId,
    now,
    annee,
    ilYA: (jours) => new Date(now.getTime() - jours * JOUR_MS),
    membres,
    actifs: membres.filter((m) => m.statut === 'ACTIF'),
    id: (cle) => idDe.get(cle) as string,
  }

  await lierPresidente(ctx)
  const contributionDe = await ouvrirCotisations(ctx)
  const versements = await enregistrerVersementsEtRecus(ctx, contributionDe)
  await creerDepenses(ctx)
  const dons = await creerCagnotte(ctx)
  const amendes = await creerAmendes(ctx)
  const misesTontine = await creerTontineEnCours(ctx)
  const votes = await creerReunions(ctx)
  await creerFonctionsSociales(ctx)

  return {
    membres: membres.length,
    versements,
    recus: versements + 1,
    recusAnnules: 1,
    depenses: DEPENSES_DEMO.length,
    dons,
    amendes,
    misesTontine,
    votes,
  }
}

/** Branches et membres (création portée par les routes : écriture directe, FK scalaires). */
async function creerBranchesEtMembres(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  membres: MembreDemo[],
  annee: number,
): Promise<Map<string, string>> {
  const brancheIds: string[] = []
  for (const nom of BRANCHES_DEMO) brancheIds.push((await prisma.brancheFamiliale.create({ data: { nom } })).id)
  const idDe = new Map<string, string>()
  for (const m of membres) {
    const cree = await prisma.membre.create({
      data: {
        nom: m.nom,
        prenom: m.prenom,
        sexe: m.sexe,
        statut: m.statut,
        telephone: m.telephone,
        anneeAdhesion: m.anneeAdhesion,
        anneeFinContribution: m.anneeFinContribution,
        brancheId: brancheIds[m.brancheIndex],
        ...(m.statut === 'DECEDE' ? { dateDeces: new Date(Date.UTC(annee - 1, 10, 3, 9)) } : {}),
      },
    })
    idDe.set(m.cle, cree.id)
  }
  return idDe
}

/** Compte ADMIN lié à la présidente (« Mon espace » réaliste) et cheffe de l'organisation. */
async function lierPresidente({ prisma, organisationId, adminId, membres, id }: ContexteRemplissage): Promise<void> {
  const presidente = membres[0]!
  await prisma.membre.update({ where: { id: id(presidente.cle) }, data: { compteUtilisateurId: adminId } })
  await definirChefOrganisation(prisma, organisationId, id(presidente.cle), 'Présidente')
}

/**
 * Barèmes puis ouverture des années (service : montant attendu copié, jamais d'année future).
 * Rend la contribution de chaque couple « membre#année ».
 */
async function ouvrirCotisations({ prisma, annee }: ContexteRemplissage): Promise<Map<string, string>> {
  for (const bareme of baremesDemo(annee)) {
    await prisma.baremeAnnuel.create({ data: bareme })
    await ouvrirAnnee(prisma, bareme.annee, annee)
  }
  const contributions: { id: string; membreId: string; annee: number }[] = await prisma.contribution.findMany({
    select: { id: true, membreId: true, annee: true },
  })
  return new Map(contributions.map((c) => [`${c.membreId}#${c.annee}`, c.id]))
}

/**
 * Versements (service : cumuls dans la même transaction) puis reçu, dans l'ordre chronologique pour
 * que la numérotation suive les dates ; puis un reçu annulé et réémis. Rend le nombre de versements.
 */
async function enregistrerVersementsEtRecus(ctx: ContexteRemplissage, contributionDe: Map<string, string>): Promise<number> {
  const { prisma, adminId, now, annee, membres, id } = ctx
  const plan = planifierVersementsDemo(membres, annee, now)
  const versementIds: string[] = []
  for (const v of plan) {
    const contributionId = contributionDe.get(`${id(v.cleMembre)}#${v.annee}`)
    if (!contributionId) throw new Error(`Contribution absente : ${v.cleMembre} ${v.annee}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { versement } = await prisma.$transaction(async (tx: any) =>
      appliquerCreationVersement(tx, {
        contributionId,
        montant: v.montant,
        dateVersement: v.date,
        mode: v.mode,
        receptionnaireId: adminId,
      }),
    )
    versementIds.push(versement.id)
    await genererRecu(prisma, versement.id, adminId, v.date)
  }
  // Voie de correction d'un reçu remis : annuler puis réémettre (le reçu annulé garde son numéro).
  const aCorriger = await prisma.recu.findFirst({ where: { versementId: versementIds[3], annuleLe: null }, select: { id: true } })
  if (!aCorriger) throw new Error('Reçu à corriger introuvable')
  await annulerRecu(prisma, aCorriger.id, adminId, 'Mode de versement mal saisi', now)
  await genererRecu(prisma, versementIds[3]!, adminId, now)
  return plan.length
}

/** Dépenses : chaque statut cible est atteint par des transitions VALIDES du workflow. */
async function creerDepenses({ prisma, adminId, ilYA }: ContexteRemplissage): Promise<void> {
  const chemin: Record<StatutDepense, StatutDepense[]> = {
    BROUILLON: [],
    EN_ATTENTE: ['EN_ATTENTE'],
    APPROUVEE: ['EN_ATTENTE', 'APPROUVEE'],
    REJETEE: ['EN_ATTENTE', 'REJETEE'],
    PAYEE: ['EN_ATTENTE', 'APPROUVEE', 'PAYEE'],
  }
  for (const d of DEPENSES_DEMO) {
    let statut: StatutDepense = 'BROUILLON'
    for (const suivant of chemin[d.cible]) {
      validerTransition(statut, suivant)
      statut = suivant
    }
    const decidee = statut === 'APPROUVEE' || statut === 'REJETEE' || statut === 'PAYEE'
    await prisma.depense.create({
      data: {
        montant: d.montant,
        date: ilYA(d.joursAvant),
        description: d.description,
        categorie: d.categorie,
        statut,
        saisiParId: adminId,
        ...(decidee ? { approuveParId: adminId } : {}),
        ...(d.motifRejet ? { motifRejet: d.motifRejet } : {}),
      },
    })
  }
}

const DONS_CAGNOTTE = 12

/** Cagnotte ouverte et ses dons. Rend le nombre de dons. */
async function creerCagnotte({ prisma, adminId, now, ilYA, membres, actifs, id }: ContexteRemplissage): Promise<number> {
  const beneficiaire = membres[2]!
  const cagnotte = await prisma.cagnotteEvenement.create({
    data: {
      titre: `Soutien au mariage de ${beneficiaire.prenom} ${beneficiaire.nom}`,
      type: 'MARIAGE',
      objectif: 300_000,
      dateEvenement: new Date(now.getTime() + 21 * JOUR_MS),
      beneficiaireMembreId: id(beneficiaire.cle),
      creeParId: adminId,
    },
  })
  for (let k = 0; k < DONS_CAGNOTTE; k++) {
    await prisma.donCagnotte.create({
      data: {
        cagnotteId: cagnotte.id,
        membreId: id(actifs[k + 3]!.cle),
        montant: 10_000 + (k % 3) * 5_000,
        date: ilYA(k + 1),
        mode: k % 2 === 0 ? 'ESPECES' : 'MOBILE_MONEY',
        saisiParId: adminId,
      },
    })
  }
  return DONS_CAGNOTTE
}

/** Amendes : encaissée, en attente, annulée (transitions validées). Rend le nombre d'amendes. */
async function creerAmendes({ prisma, adminId, ilYA, actifs, id }: ContexteRemplissage): Promise<number> {
  const enRetard = actifs.filter((m) => m.profil === 'EN_RETARD')
  const amendePayee = await prisma.amende.create({
    data: { membreId: id(enRetard[0]!.cle), type: 'RETARD_COTISATION', motif: 'Retard de cotisation', montant: 2_000, dateAmende: ilYA(60), creeParId: adminId },
  })
  validerTransitionAmende('IMPAYEE', 'PAYEE')
  await prisma.amende.update({ where: { id: amendePayee.id }, data: { statut: 'PAYEE', datePaiement: ilYA(50), modePaiement: 'ESPECES' } })
  await prisma.amende.create({
    data: { membreId: id(enRetard[1]!.cle), type: 'ABSENCE_REUNION', motif: "Absence non excusée à l'assemblée", montant: 1_000, dateAmende: ilYA(38), creeParId: adminId },
  })
  const amendeAnnulee = await prisma.amende.create({
    data: { membreId: id(actifs[5]!.cle), type: 'AUTRE', motif: 'Retard à la réunion', montant: 500, dateAmende: ilYA(38), creeParId: adminId },
  })
  validerTransitionAmende('IMPAYEE', 'ANNULEE')
  await prisma.amende.update({ where: { id: amendeAnnulee.id }, data: { statut: 'ANNULEE' } })
  return 3
}

/** Tontine à ordre fixe, 10 participants : 5 tours reversés, le 6e en cours de collecte. Rend le nombre de mises. */
async function creerTontineEnCours({ prisma, ilYA, actifs, id }: ContexteRemplissage): Promise<number> {
  const tontine = await creerTontine(prisma, { nom: 'Tontine mensuelle', montantBaseMise: 10_000, modeRotation: 'ORDRE_FIXE' })
  const participants = actifs.filter((m) => m.profil === 'A_JOUR').slice(0, 10)
  const cycleId = await ouvrirCycle(prisma, tontine.id, participants.map((m, i) => ({ membreId: id(m.cle), parts: i === 0 ? 2 : 1 })))
  const tours: { id: string; numero: number }[] = await prisma.tourTontine.findMany({
    where: { cycleId },
    orderBy: { numero: 'asc' },
    select: { id: true, numero: true },
  })
  let misesTontine = 0
  for (const tour of tours.slice(0, 5)) {
    for (const p of participants) {
      await enregistrerMise(prisma, tour.id, id(p.cle))
      misesTontine++
    }
    await reverserTour(prisma, tour.id, ilYA((6 - tour.numero) * 30))
  }
  for (const p of participants.slice(0, 6)) {
    await enregistrerMise(prisma, tours[5]!.id, id(p.cle))
    misesTontine++
  }
  return misesTontine
}

const VOTANTS = 20

/**
 * Réunion passée (ordre du jour, présences, compte-rendu, résolution adoptée par vote) et réunion à
 * venir. Rend le nombre de votes.
 */
async function creerReunions({ prisma, now, ilYA, actifs, id }: ContexteRemplissage): Promise<number> {
  const passee = await creerReunion(prisma, {
    date: ilYA(40),
    lieu: 'Salle communautaire du quartier',
    type: 'ORDINAIRE',
    statut: 'TENUE',
    compteRenduTexte:
      "L'assemblée a examiné le bilan financier du semestre, approuvé le soutien aux familles endeuillées et voté la cotisation de l'an prochain.",
    pointsOrdreDuJour: [{ titre: 'Bilan financier du semestre' }, { titre: 'Soutien aux familles endeuillées' }, { titre: 'Divers' }],
  })
  // `creerReunion` relit la réunion (`findUnique` → type nullable) : garde explicite pour TypeScript.
  if (!passee) throw new Error('Réunion de démonstration non créée')
  for (const [i, m] of actifs.slice(0, 28).entries()) {
    const statut = i < 24 ? 'PRESENT' : i < 26 ? 'EXCUSE' : 'ABSENT'
    await prisma.presenceReunion.upsert({
      where: { reunionId_membreId: { reunionId: passee.id, membreId: id(m.cle) } },
      create: { reunionId: passee.id, membreId: id(m.cle), statut },
      update: { statut },
    })
  }
  const resolution = await creerResolution(prisma, passee.id, {
    texte: "Porter la cotisation annuelle à 24 000 FCFA à partir de l'an prochain.",
    pointOrdreDuJourId: passee.pointsOrdreDuJour[0].id,
  })
  await ouvrirVoteResolution(prisma, resolution.id)
  const sens = ['POUR', 'CONTRE', 'ABSTENTION'] as const
  for (const [i, m] of actifs.slice(0, VOTANTS).entries()) {
    await voterResolution(prisma, resolution.id, id(m.cle), i < 14 ? sens[0] : i < 18 ? sens[1] : sens[2])
  }
  await cloturerResolution(prisma, resolution.id, ilYA(40))
  await creerResolution(prisma, passee.id, {
    texte: "Désigner deux commissaires aux comptes pour l'exercice en cours.",
    statut: 'ADOPTEE',
    dateVote: ilYA(40),
  })

  await creerReunion(prisma, {
    date: new Date(now.getTime() + 10 * JOUR_MS),
    lieu: 'Salle communautaire du quartier',
    type: 'ORDINAIRE',
    statut: 'PLANIFIEE',
    pointsOrdreDuJour: [{ titre: 'Point sur les cotisations' }, { titre: 'Préparation de la fête annuelle' }],
  })
  return VOTANTS
}

/** Fonctions sociales et leurs titulaires. */
async function creerFonctionsSociales({ prisma, annee, membres, id }: ContexteRemplissage): Promise<void> {
  const titulaires: [string, string][] = [
    ['Présidente', membres[0]!.cle],
    ['Trésorier', membres[1]!.cle],
    ['Secrétaire', membres[3]!.cle],
    ['Commissaire aux comptes', membres[4]!.cle],
  ]
  for (const [nom, cle] of titulaires) {
    const fonction = await creerFonction(prisma, { nom })
    await creerAffectation(prisma, { fonctionId: fonction.id, membreId: id(cle), dateDebut: new Date(Date.UTC(annee - 2, 0, 15, 9)) })
  }
}
