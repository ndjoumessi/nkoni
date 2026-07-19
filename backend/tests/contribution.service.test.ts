import { describe, it, expect } from 'vitest'
import {
  ouvrirAnnee,
  ouvrirAnneeMembre,
  BaremeIntrouvableError,
  MembreNonEligibleError,
  type OuvrirAnneePrisma,
  type OuvrirAnneeMembrePrisma,
} from '../src/services/contribution.service'

/**
 * Tests unitaires de ouvrirAnnee (Prisma mocké, stateful pour l'idempotence).
 */

function buildMock(options: {
  bareme: { annee: number; montantAttendu: number } | null
  membres: { id: string }[]
}) {
  const existing = new Set<string>() // clés (membreId|annee) déjà créées
  const prisma: OuvrirAnneePrisma = {
    baremeAnnuel: {
      findFirst: async ({ where }: { where: { annee: number } }) =>
        options.bareme && options.bareme.annee === where.annee ? options.bareme : null,
    },
    membre: {
      findMany: async () => options.membres,
    },
    contribution: {
      createMany: async ({
        data,
      }: {
        data: { membreId: string; annee: number }[]
      }) => {
        let count = 0
        for (const d of data) {
          const key = `${d.membreId}|${d.annee}`
          if (existing.has(key)) continue // skipDuplicates
          existing.add(key)
          count++
        }
        return { count }
      },
    },
  }
  return prisma
}

describe('ouvrirAnnee (§5 point 4)', () => {
  it('crée une Contribution par membre éligible, montantAttendu copié du barème', async () => {
    const prisma = buildMock({
      bareme: { annee: 2025, montantAttendu: 10_000 },
      membres: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    })

    const res = await ouvrirAnnee(prisma, 2025)

    expect(res).toMatchObject({
      annee: 2025,
      montantAttendu: 10_000,
      membresEligibles: 3,
      contributionsCreees: 3,
    })
  })

  it('lève BaremeIntrouvableError si aucun barème pour l’année (pas de création à 0)', async () => {
    const prisma = buildMock({ bareme: null, membres: [{ id: 'm1' }] })
    await expect(ouvrirAnnee(prisma, 2030)).rejects.toBeInstanceOf(BaremeIntrouvableError)
  })

  it('est idempotent : un second appel ne recrée aucune contribution', async () => {
    const prisma = buildMock({
      bareme: { annee: 2025, montantAttendu: 10_000 },
      membres: [{ id: 'm1' }, { id: 'm2' }],
    })

    const first = await ouvrirAnnee(prisma, 2025)
    const second = await ouvrirAnnee(prisma, 2025)

    expect(first.contributionsCreees).toBe(2)
    expect(second.contributionsCreees).toBe(0) // skipDuplicates via @@unique
    expect(second.membresEligibles).toBe(2)
  })
})

/**
 * Ouverture CIBLÉE (un seul membre) — permet d'encaisser une année de la fenêtre d'adhésion
 * jamais ouverte globalement (le montant attendu cumulé la compte déjà).
 */
function buildMockMembre(options: {
  bareme: { annee: number; montantAttendu: number } | null
  membre: { statut: string; anneeAdhesion: number; anneeFinContribution: number | null } | null
  contributionExistante?: { id: string; annee: number; montantAttendu: number }
}) {
  const creations: { membreId: string; annee: number; montantAttendu: number }[] = []
  const prisma: OuvrirAnneeMembrePrisma = {
    baremeAnnuel: {
      findFirst: async ({ where }: { where: { annee: number } }) =>
        options.bareme && options.bareme.annee === where.annee ? options.bareme : null,
    },
    membre: { findUnique: async () => options.membre },
    contribution: {
      findFirst: async ({ where }: { where: { annee: number } }) =>
        options.contributionExistante && options.contributionExistante.annee === where.annee
          ? options.contributionExistante
          : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        creations.push(data)
        return { id: 'c-neuve', ...data }
      },
    },
  }
  return { prisma, creations }
}

const membreActif = { statut: 'ACTIF', anneeAdhesion: 2023, anneeFinContribution: null }

describe('ouvrirAnneeMembre (ouverture ciblée)', () => {
  it('crée la contribution d’une année de la fenêtre d’adhésion jamais ouverte', async () => {
    const { prisma, creations } = buildMockMembre({
      bareme: { annee: 2023, montantAttendu: 12_000 },
      membre: membreActif,
    })
    const res = await ouvrirAnneeMembre(prisma, 'm1', 2023)
    expect(res).toMatchObject({ annee: 2023, montantAttendu: 12_000 })
    // montantAttendu COPIÉ du barème (historisation) + FK scalaire.
    expect(creations).toEqual([{ membreId: 'm1', annee: 2023, montantAttendu: 12_000 }])
  })

  it('est idempotent : renvoie la contribution existante sans rien créer', async () => {
    const { prisma, creations } = buildMockMembre({
      bareme: { annee: 2023, montantAttendu: 12_000 },
      membre: membreActif,
      contributionExistante: { id: 'c-deja', annee: 2023, montantAttendu: 12_000 },
    })
    const res = await ouvrirAnneeMembre(prisma, 'm1', 2023)
    expect(res).toMatchObject({ id: 'c-deja' })
    expect(creations).toHaveLength(0)
  })

  it('lève BaremeIntrouvableError si l’année n’a pas de barème (jamais de création à 0)', async () => {
    const { prisma } = buildMockMembre({ bareme: null, membre: membreActif })
    await expect(ouvrirAnneeMembre(prisma, 'm1', 2019)).rejects.toBeInstanceOf(
      BaremeIntrouvableError,
    )
  })

  it('lève MembreNonEligibleError avant l’année d’adhésion', async () => {
    const { prisma } = buildMockMembre({
      bareme: { annee: 2022, montantAttendu: 12_000 },
      membre: membreActif, // adhésion 2023
    })
    await expect(ouvrirAnneeMembre(prisma, 'm1', 2022)).rejects.toBeInstanceOf(
      MembreNonEligibleError,
    )
  })

  it('lève MembreNonEligibleError après la fin de contribution', async () => {
    const { prisma } = buildMockMembre({
      bareme: { annee: 2026, montantAttendu: 12_000 },
      membre: { statut: 'ACTIF', anneeAdhesion: 2023, anneeFinContribution: 2024 },
    })
    await expect(ouvrirAnneeMembre(prisma, 'm1', 2026)).rejects.toBeInstanceOf(
      MembreNonEligibleError,
    )
  })

  it('renvoie null si le membre est introuvable (→ 404, pas de fuite d’existence)', async () => {
    const { prisma } = buildMockMembre({
      bareme: { annee: 2023, montantAttendu: 12_000 },
      membre: null,
    })
    expect(await ouvrirAnneeMembre(prisma, 'inconnu', 2023)).toBeNull()
  })
})
