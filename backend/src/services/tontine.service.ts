import { randomInt } from 'node:crypto'

/**
 * Mécanique de TONTINE (§ tontine) — épargne rotative (ROSCA). Logique i18n-AGNOSTIQUE (erreurs
 * typées, aucun texte) ; Prisma injecté (mockable). Cœurs déterministes : le tirage prend un
 * sélecteur d'index injectable → testable sans hasard réel, mais CSPRNG par défaut (cf. TIRAGE).
 *
 * MODÈLE : une `Tontine` (montant de base d'UNE part) → `CycleTontine` (rotation complète) →
 * `TourTontine` (un bénéficiaire par tour). Chaque participant verse une `MiseTontine` par tour ;
 * le pot est reversé au bénéficiaire. La mise d'un membre = `parts × montantBaseMise`.
 *
 * ROTATION :
 *  - ORDRE_FIXE : les bénéficiaires sont assignés à l'OUVERTURE du cycle depuis l'ordre des
 *    participants (tour k → participant d'ordre k).
 *  - TIRAGE : bénéficiaire tiré au sort tour par tour (`tirerBeneficiaire`), parmi ceux qui n'ont
 *    pas encore reçu dans le cycle.
 *  - ENCHERE : schema-ready mais NON câblé — `ouvrirCycle` l'accepte, mais aucun bénéficiaire n'est
 *    assigné automatiquement et `tirerBeneficiaire` le refuse (`ModeNonSupporteError`). À implémenter
 *    ici (mise à prix, escompte) le jour venu.
 *
 * ADOSSEMENT TRÉSORERIE : délibérément AUTONOME. La tontine fait circuler l'argent des MEMBRES
 * entre eux (mises collectées = pot reversé, net ≈ 0), ce n'est pas la trésorerie de l'association.
 * L'inclure dans `calculerTresorerie` fausserait le solde de l'association. Les agrégats tontine
 * (pot, mises) vivent donc dans les vues tontine, pas dans `GET /tresorerie`.
 */

export type ModeRotation = 'ORDRE_FIXE' | 'TIRAGE' | 'ENCHERE'

/* -------------------------------------------------------------------------- */
/* Erreurs métier (mappées en 4xx par la route)                               */
/* -------------------------------------------------------------------------- */

export class TontineIntrouvableError extends Error {
  constructor() {
    super('Tontine introuvable.')
    this.name = 'TontineIntrouvableError'
  }
}
export class CycleIntrouvableError extends Error {
  constructor() {
    super('Cycle de tontine introuvable.')
    this.name = 'CycleIntrouvableError'
  }
}
export class TourIntrouvableError extends Error {
  constructor() {
    super('Tour de tontine introuvable.')
    this.name = 'TourIntrouvableError'
  }
}
export class MembreIntrouvableError extends Error {
  constructor() {
    super('Membre introuvable.')
    this.name = 'MembreIntrouvableError'
  }
}
/** Moins de 2 participants : une tontine n'a pas de sens à un seul membre. → 400 */
export class ParticipantsInsuffisantsError extends Error {
  constructor() {
    super('Au moins deux participants sont requis.')
    this.name = 'ParticipantsInsuffisantsError'
  }
}
/** Participant en double dans la liste d'ouverture. → 400 */
export class ParticipantDupliqueError extends Error {
  constructor() {
    super('Un membre est présent plusieurs fois dans la liste.')
    this.name = 'ParticipantDupliqueError'
  }
}
/** Le tour n'a pas de bénéficiaire (reversement impossible). → 409 */
export class TourNonAttribueError extends Error {
  constructor() {
    super("Le tour n'a pas de bénéficiaire.")
    this.name = 'TourNonAttribueError'
  }
}
/** Le tour est déjà reversé (non rejouable). → 409 */
export class TourDejaReverseError extends Error {
  constructor() {
    super('Le tour est déjà reversé.')
    this.name = 'TourDejaReverseError'
  }
}
/** Le tour a déjà un bénéficiaire (tirage/attribution non rejouable). → 409 */
export class TourDejaAttribueError extends Error {
  constructor() {
    super('Le tour a déjà un bénéficiaire.')
    this.name = 'TourDejaAttribueError'
  }
}
/** Opération non disponible pour ce mode de rotation (ex. tirage en ENCHERE). → 409 */
export class ModeNonSupporteError extends Error {
  constructor(public mode: string) {
    super(`Opération non supportée pour le mode ${mode}.`)
    this.name = 'ModeNonSupporteError'
  }
}
/** Plus aucun participant éligible à tirer (tous ont déjà reçu). → 409 */
export class AucunEligibleError extends Error {
  constructor() {
    super('Aucun participant éligible au tirage.')
    this.name = 'AucunEligibleError'
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TontinePrisma {
  tontine: {
    create(args: any): Promise<any>
    findMany(args?: any): Promise<any[]>
    findFirst(args: any): Promise<any>
  }
  cycleTontine: {
    create(args: any): Promise<any>
    findFirst(args: any): Promise<any>
    aggregate(args: any): Promise<any>
  }
  participationTontine: {
    createMany?(args: any): Promise<any>
    create(args: any): Promise<any>
    findMany(args: any): Promise<any[]>
  }
  tourTontine: {
    create(args: any): Promise<any>
    findFirst(args: any): Promise<any>
    findMany(args: any): Promise<any[]>
    update(args: any): Promise<any>
  }
  miseTontine: {
    upsert(args: any): Promise<any>
    aggregate(args: any): Promise<any>
  }
  membre: {
    findFirst(args: any): Promise<any>
    findMany(args: any): Promise<any[]>
  }
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CreerTontineParams {
  nom: string
  montantBaseMise: number
  modeRotation?: ModeRotation
}

/** Crée une tontine (configuration ; aucun cycle encore). */
export async function creerTontine(prisma: TontinePrisma, params: CreerTontineParams) {
  return prisma.tontine.create({
    data: {
      nom: params.nom,
      montantBaseMise: params.montantBaseMise,
      ...(params.modeRotation ? { modeRotation: params.modeRotation } : {}),
    },
  })
}

/** Liste les tontines de l'org (avec un décompte de cycles). */
export function listerTontines(prisma: TontinePrisma) {
  return prisma.tontine.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { cycles: true } } },
  })
}

/** Détail d'une tontine : cycles, tours (ordonnés), participations. */
export async function getTontine(prisma: TontinePrisma, id: string) {
  const tontine = await prisma.tontine.findFirst({
    where: { id },
    include: {
      cycles: {
        orderBy: { numero: 'asc' },
        include: {
          participations: { orderBy: { ordre: 'asc' } },
          // Mises par tour (`{ membreId, montant }`) → le front dresse la checklist payé/non-payé
          // par participant et le collecté à ce jour (le pot ATTENDU se calcule côté client).
          tours: {
            orderBy: { numero: 'asc' },
            include: { mises: { select: { membreId: true, montant: true } } },
          },
        },
      },
    },
  })
  if (!tontine) throw new TontineIntrouvableError()
  return tontine
}

export interface ParticipantInput {
  membreId: string
  parts?: number
}

/**
 * Ouvre un CYCLE : crée les participations (ordre = position dans la liste), génère un tour par
 * participant, et — en ORDRE_FIXE — assigne le bénéficiaire de chaque tour depuis l'ordre. Tout
 * dans une transaction. `numero` = max(numéro des cycles de la tontine) + 1.
 */
export async function ouvrirCycle(
  prisma: TontinePrisma,
  tontineId: string,
  participants: ParticipantInput[],
) {
  const tontine = await prisma.tontine.findFirst({
    where: { id: tontineId },
    select: { id: true, modeRotation: true },
  })
  if (!tontine) throw new TontineIntrouvableError()
  if (participants.length < 2) throw new ParticipantsInsuffisantsError()
  const ids = participants.map((p) => p.membreId)
  if (new Set(ids).size !== ids.length) throw new ParticipantDupliqueError()

  // APPARTENANCE DES PARTICIPANTS — lecture SCOPÉE, une seule requête. Sans elle, un `membreId`
  // d'une AUTRE organisation entrerait dans le cycle : l'extension tenant force `organisationId`
  // sur le `create` d'une participation mais laisse `membreId` tel quel, et la clé étrangère vers
  // `Membre` est satisfaite quelle que soit l'org — rien ne l'arrête au niveau base. En ORDRE_FIXE
  // ce membre étranger devient de surcroît BÉNÉFICIAIRE d'un tour, donc destinataire du pot.
  // Ce n'est pas théorique : les `membreId` viennent du CORPS de la requête (`POST
  // /tontines/:id/cycles`), ils ne sont dérivés d'aucune identité authentifiée.
  const membresOrg = await prisma.membre.findMany({ where: { id: { in: ids } }, select: { id: true } })
  if (membresOrg.length !== ids.length) throw new MembreIntrouvableError()

  const agg = await prisma.cycleTontine.aggregate({
    where: { tontineId },
    _max: { numero: true },
  })
  const numero = (agg?._max?.numero ?? 0) + 1
  const ordreFixe = tontine.modeRotation === 'ORDRE_FIXE'

  return prisma.$transaction(async (tx: TontinePrisma) => {
    const cycle = await tx.cycleTontine.create({ data: { tontineId, numero } })
    for (const [i, p] of participants.entries()) {
      await tx.participationTontine.create({
        data: { cycleId: cycle.id, membreId: p.membreId, parts: p.parts ?? 1, ordre: i + 1 },
      })
    }
    for (const [i, p] of participants.entries()) {
      await tx.tourTontine.create({
        data: {
          cycleId: cycle.id,
          numero: i + 1,
          // ORDRE_FIXE : bénéficiaire connu d'avance (tour k → participant d'ordre k). Sinon null
          // (TIRAGE : tiré plus tard ; ENCHERE : attribué par l'enchère, non câblée).
          ...(ordreFixe ? { beneficiaireId: p.membreId } : {}),
        },
      })
    }
    return cycle.id
  })
}

/** Charge un tour SCOPÉ + le mode de sa tontine (pour les règles de rotation). */
async function chargerTour(prisma: TontinePrisma, tourId: string) {
  const tour = await prisma.tourTontine.findFirst({
    where: { id: tourId },
    select: {
      id: true,
      cycleId: true,
      beneficiaireId: true,
      statut: true,
      cycle: { select: { tontine: { select: { modeRotation: true, montantBaseMise: true } } } },
    },
  })
  if (!tour) throw new TourIntrouvableError()
  return tour
}

/**
 * TIRAGE : attribue au tour un bénéficiaire tiré parmi les participants du cycle qui n'ont pas
 * encore reçu. Refus si le mode n'est pas TIRAGE, si le tour a déjà un bénéficiaire, ou s'il n'y a
 * plus d'éligible.
 *
 * **Aléa CRYPTOGRAPHIQUE (`randomInt`), jamais `Math.random`.** Ce tirage décide QUI touche le
 * pot, et dans une tontine recevoir tôt vaut strictement mieux que tard : valeur temporelle de
 * l'argent, et surtout risque que le cycle s'effondre avant son terme — auquel cas les derniers
 * bénéficiaires ont cotisé sans jamais recevoir. Le tirage alloue donc de l'argent réel. Or
 * `Math.random` (xorshift128+ en V8) est un PRNG dont l'état interne se reconstitue depuis les
 * sorties observées, et les résultats des tirages sont publics au sein du groupe — sur un produit
 * qui vend la transparence financière, l'équité du tirage doit pouvoir s'affirmer sans réserve.
 * `randomInt(n)` tire directement un entier de `[0, n)` sans biais de modulo.
 *
 * Le sélecteur reste injectable, mais UNIQUEMENT pour rendre les tests déterministes : la valeur
 * par défaut n'est jamais un repli non sûr.
 */
export async function tirerBeneficiaire(
  prisma: TontinePrisma,
  tourId: string,
  choisirIndex: (bornesup: number) => number = (n) => randomInt(n),
): Promise<{ tourId: string; beneficiaireId: string }> {
  const tour = await chargerTour(prisma, tourId)
  const mode = tour.cycle.tontine.modeRotation
  if (mode !== 'TIRAGE') throw new ModeNonSupporteError(mode)
  if (tour.beneficiaireId) throw new TourDejaAttribueError()

  const participations = await prisma.participationTontine.findMany({
    where: { cycleId: tour.cycleId },
    select: { membreId: true },
  })
  const dejaBeneficiaires = await prisma.tourTontine.findMany({
    where: { cycleId: tour.cycleId, beneficiaireId: { not: null } },
    select: { beneficiaireId: true },
  })
  const recus = new Set(dejaBeneficiaires.map((t) => t.beneficiaireId))
  const eligibles = participations.map((p) => p.membreId).filter((id) => !recus.has(id))
  if (eligibles.length === 0) throw new AucunEligibleError()

  // `randomInt` renvoie déjà un entier dans [0, n) : pas de `Math.floor(x*n) % n`, dont le modulo
  // était redondant et masquait la vraie source d'aléa.
  const choisi = eligibles[choisirIndex(eligibles.length)]
  await prisma.tourTontine.update({ where: { id: tourId }, data: { beneficiaireId: choisi } })
  return { tourId, beneficiaireId: choisi }
}

/**
 * Enregistre (ou corrige) la MISE d'un membre pour un tour. Montant par défaut = `parts ×
 * montantBaseMise` (calculé depuis la participation) si non fourni. Upsert sur (tour, membre) →
 * jamais de doublon. Le membre doit participer au cycle (lecture scopée + appartenance).
 */
export async function enregistrerMise(
  prisma: TontinePrisma,
  tourId: string,
  membreId: string,
  montant?: number,
): Promise<{ tourId: string; membreId: string; montant: number }> {
  const tour = await chargerTour(prisma, tourId)
  if (tour.statut === 'REVERSE') throw new TourDejaReverseError()
  const participation = await prisma.participationTontine.findMany({
    where: { cycleId: tour.cycleId, membreId },
    select: { parts: true },
  })
  if (participation.length === 0) throw new MembreIntrouvableError()
  const montantFinal = montant ?? participation[0].parts * tour.cycle.tontine.montantBaseMise
  await prisma.miseTontine.upsert({
    where: { tourId_membreId: { tourId, membreId } },
    create: { tourId, membreId, montant: montantFinal },
    update: { montant: montantFinal },
  })
  return { tourId, membreId, montant: montantFinal }
}

/**
 * REVERSE le pot au bénéficiaire : fige `montantPot` = Σ des mises encaissées, passe le tour en
 * REVERSE et horodate. Refus si pas de bénéficiaire, ou déjà reversé (non rejouable).
 */
export async function reverserTour(
  prisma: TontinePrisma,
  tourId: string,
  now: Date = new Date(),
): Promise<{ tourId: string; montantPot: number; beneficiaireId: string }> {
  const tour = await chargerTour(prisma, tourId)
  if (tour.statut === 'REVERSE') throw new TourDejaReverseError()
  if (!tour.beneficiaireId) throw new TourNonAttribueError()
  const agg = await prisma.miseTontine.aggregate({
    where: { tourId },
    _sum: { montant: true },
  })
  const montantPot = agg?._sum?.montant ?? 0
  await prisma.tourTontine.update({
    where: { id: tourId },
    data: { montantPot, statut: 'REVERSE', dateReversement: now },
  })
  return { tourId, montantPot, beneficiaireId: tour.beneficiaireId }
}
