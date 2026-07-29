import { ResolutionIntrouvableError } from './resolution.service'

/**
 * V2 (§ vie associative) — Votes en ligne sur les résolutions.
 *
 * Un membre exprime son sens (POUR/CONTRE/ABSTENTION) depuis son espace ; UNE ligne par
 * (résolution, membre) — revoter écrase (upsert). Le dirigeant dépouille (tally) puis CLÔTURE :
 * la clôture fige le statut de la résolution, DÉRIVÉ du tally, et horodate `dateVote`.
 *
 * MODÈLE OUVERT/CLÔTURÉ SANS NOUVEL ENUM : `StatutResolution` ne porte pas d'état « en vote »,
 * et en ajouter un déborderait ce lot (badges, i18n, défaut existant). On réutilise `dateVote` :
 * `dateVote === null` ⇒ résolution OUVERTE au vote ; une fois `dateVote` posé (par la clôture),
 * elle est CLÔTURÉE et n'accepte plus de vote. Une résolution créée avec un `dateVote` fourni à
 * la main (saisie d'un résultat déjà tenu hors ligne) est donc d'emblée close — cohérent.
 *
 * Découplé de Fastify, Prisma injecté (mockable en test). `ResolutionIntrouvableError` est
 * RÉUTILISÉE depuis resolution.service (même identité → même mapping 404 à la frontière HTTP).
 */

export type SensVote = 'POUR' | 'CONTRE' | 'ABSTENTION'
export const SENS_VOTE: SensVote[] = ['POUR', 'CONTRE', 'ABSTENTION']

/** La résolution est clôturée : elle n'accepte plus de vote. → 409 */
export class ResolutionClotureeError extends Error {
  constructor() {
    super('Résolution clôturée : le vote est fermé.')
    this.name = 'ResolutionClotureeError'
  }
}

/** Tally d'un dépouillement — comptes par sens + total exprimé. */
export interface Depouillement {
  POUR: number
  CONTRE: number
  ABSTENTION: number
  total: number
}

/**
 * Statut DÉRIVÉ du tally à la clôture. Majorité simple des exprimés POUR/CONTRE : les
 * ABSTENTION ne comptent PAS dans la majorité. Égalité (y compris 0-0) ⇒ non adoptée (REJETEE) —
 * une résolution n'est adoptée que si le POUR l'emporte STRICTEMENT. `REPORTEE` n'est jamais
 * dérivé automatiquement (report = décision humaine, hors clôture par vote).
 */
export function statutSelonTally(d: Depouillement): 'ADOPTEE' | 'REJETEE' {
  return d.POUR > d.CONTRE ? 'ADOPTEE' : 'REJETEE'
}

function compterTally(votes: { sens: string }[]): Depouillement {
  const d: Depouillement = { POUR: 0, CONTRE: 0, ABSTENTION: 0, total: votes.length }
  for (const v of votes) {
    if (v.sens === 'POUR') d.POUR += 1
    else if (v.sens === 'CONTRE') d.CONTRE += 1
    else if (v.sens === 'ABSTENTION') d.ABSTENTION += 1
  }
  return d
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface VotePrisma {
  resolution: {
    findFirst(args: any): Promise<any>
    update(args: any): Promise<any>
  }
  vote: {
    upsert(args: any): Promise<any>
    findMany(args: any): Promise<any[]>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Charge une résolution SCOPÉE (id d'une autre org → null → 404, isolation tenant). */
async function chargerResolution(
  prisma: VotePrisma,
  resolutionId: string,
): Promise<{ id: string; statut: string; dateVote: Date | null }> {
  const r = await prisma.resolution.findFirst({
    where: { id: resolutionId },
    select: { id: true, statut: true, dateVote: true },
  })
  if (!r) throw new ResolutionIntrouvableError()
  return r
}

/**
 * Le membre pose/actualise SON vote. Refus si la résolution est clôturée (`dateVote` posé).
 * Upsert sur la clé unique (resolutionId, membreId) → revoter écrase, jamais de doublon.
 */
export async function voterResolution(
  prisma: VotePrisma,
  resolutionId: string,
  membreId: string,
  sens: SensVote,
): Promise<{ sens: SensVote }> {
  const resolution = await chargerResolution(prisma, resolutionId)
  if (resolution.dateVote !== null) throw new ResolutionClotureeError()
  await prisma.vote.upsert({
    where: { resolutionId_membreId: { resolutionId, membreId } },
    create: { resolutionId, membreId, sens },
    update: { sens },
  })
  return { sens }
}

export interface DepouillementResultat {
  resolution: { id: string; statut: string; dateVote: Date | null; ouvert: boolean }
  depouillement: Depouillement
  votes: { membreId: string; nom: string; prenom: string; sens: string }[]
}

/** Dépouillement (vue dirigeant) : tally + votes nominatifs. */
export async function depouillerResolution(
  prisma: VotePrisma,
  resolutionId: string,
): Promise<DepouillementResultat> {
  const resolution = await chargerResolution(prisma, resolutionId)
  const lignes = (await prisma.vote.findMany({
    where: { resolutionId },
    select: { membreId: true, sens: true, membre: { select: { nom: true, prenom: true } } },
    orderBy: [{ membre: { nom: 'asc' } }],
  })) as { membreId: string; sens: string; membre: { nom: string; prenom: string } }[]
  return {
    resolution: {
      id: resolution.id,
      statut: resolution.statut,
      dateVote: resolution.dateVote,
      ouvert: resolution.dateVote === null,
    },
    depouillement: compterTally(lignes),
    votes: lignes.map((l) => ({ membreId: l.membreId, nom: l.membre.nom, prenom: l.membre.prenom, sens: l.sens })),
  }
}

/**
 * CLÔTURE : fige le statut DÉRIVÉ du tally et horodate `dateVote`. Refus si déjà clôturée
 * (`dateVote` posé) → 409, non rejouable. `now` injecté → déterministe en test.
 */
export async function cloturerResolution(
  prisma: VotePrisma,
  resolutionId: string,
  now: Date = new Date(),
): Promise<{ id: string; statut: 'ADOPTEE' | 'REJETEE'; dateVote: Date; depouillement: Depouillement }> {
  const resolution = await chargerResolution(prisma, resolutionId)
  if (resolution.dateVote !== null) throw new ResolutionClotureeError()
  const votes = (await prisma.vote.findMany({
    where: { resolutionId },
    select: { sens: true },
  })) as { sens: string }[]
  const depouillement = compterTally(votes)
  const statut = statutSelonTally(depouillement)
  await prisma.resolution.update({ where: { id: resolutionId }, data: { statut, dateVote: now } })
  return { id: resolutionId, statut, dateVote: now, depouillement }
}
