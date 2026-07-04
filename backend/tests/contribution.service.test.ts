import { describe, it, expect } from 'vitest'
import {
  ouvrirAnnee,
  BaremeIntrouvableError,
  type OuvrirAnneePrisma,
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
      findUnique: async ({ where }: { where: { annee: number } }) =>
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
