/**
 * Service Contributions — ouverture d'année (§5 point 4).
 *
 * Découplé de Fastify, Prisma injecté (mockable en test).
 */

/** Surface minimale de Prisma utilisée par ouvrirAnnee (mockable). */
export interface OuvrirAnneePrisma {
  baremeAnnuel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args: any): Promise<any[]>
  }
  contribution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMany(args: any): Promise<{ count: number }>
  }
}

/** Levée quand aucun BaremeAnnuel n'existe pour l'année demandée. */
export class BaremeIntrouvableError extends Error {
  readonly annee: number
  constructor(annee: number) {
    super(`Aucun barème n'est configuré pour l'année ${annee}.`)
    this.name = 'BaremeIntrouvableError'
    this.annee = annee
  }
}

export interface OuvrirAnneeResult {
  annee: number
  montantAttendu: number
  membresEligibles: number
  contributionsCreees: number
}

/**
 * Crée automatiquement une Contribution pour chaque Membre ACTIF éligible à l'année
 * donnée, avec montantAttendu copié du BaremeAnnuel (historisation).
 *
 * Éligibilité : statut ACTIF, anneeAdhesion <= annee, et
 * (anneeFinContribution == null OU anneeFinContribution >= annee).
 *
 * - Si aucun BaremeAnnuel n'existe pour l'année → BaremeIntrouvableError (pas de
 *   création silencieuse à 0).
 * - Idempotent : `createMany({ skipDuplicates: true })` s'appuie sur le @@unique
 *   (membreId, annee) → un second appel ne recrée rien (contributionsCreees = 0).
 */
export async function ouvrirAnnee(
  prisma: OuvrirAnneePrisma,
  annee: number,
): Promise<OuvrirAnneeResult> {
  const bareme = await prisma.baremeAnnuel.findUnique({ where: { annee } })
  if (!bareme) {
    throw new BaremeIntrouvableError(annee)
  }
  const montantAttendu: number = bareme.montantAttendu

  const membres = await prisma.membre.findMany({
    where: {
      statut: 'ACTIF',
      anneeAdhesion: { lte: annee },
      OR: [{ anneeFinContribution: null }, { anneeFinContribution: { gte: annee } }],
    },
    select: { id: true },
  })

  const data = membres.map((m) => ({
    membreId: m.id as string,
    annee,
    montantAttendu,
  }))

  const created =
    data.length > 0
      ? await prisma.contribution.createMany({ data, skipDuplicates: true })
      : { count: 0 }

  return {
    annee,
    montantAttendu,
    membresEligibles: membres.length,
    contributionsCreees: created.count,
  }
}
