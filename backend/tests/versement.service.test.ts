import { describe, it, expect } from 'vitest'
import {
  appliquerSuppressionVersement,
  reconcilierVersements,
  VersementAvecRecuError,
} from '../src/services/versement.service'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('reconcilierVersements (audit M2)', () => {
  it('ne signale AUCUN écart quand montantVerse == Σ versements', async () => {
    const prisma: any = {
      contribution: {
        findMany: async () => [
          { id: 'c1', membreId: 'm1', annee: 2025, montantVerse: 500 },
          { id: 'c3', membreId: 'm3', annee: 2025, montantVerse: 0 }, // aucun versement
        ],
      },
      versement: {
        groupBy: async () => [{ contributionId: 'c1', _sum: { montant: 500 } }],
      },
    }
    const ecarts = await reconcilierVersements(prisma)
    expect(ecarts).toEqual([])
  })

  it('détecte l’écart quand le compteur dénormalisé diverge de la somme réelle', async () => {
    const prisma: any = {
      contribution: {
        findMany: async () => [
          { id: 'c1', membreId: 'm1', annee: 2025, montantVerse: 500 }, // cohérent
          { id: 'c2', membreId: 'm2', annee: 2025, montantVerse: 300 }, // Σ = 250 → écart +50
        ],
      },
      versement: {
        groupBy: async () => [
          { contributionId: 'c1', _sum: { montant: 500 } },
          { contributionId: 'c2', _sum: { montant: 250 } },
        ],
      },
    }
    const ecarts = await reconcilierVersements(prisma)
    expect(ecarts).toHaveLength(1)
    expect(ecarts[0]).toMatchObject({
      contributionId: 'c2',
      montantVerseEnregistre: 300,
      sommeVersements: 250,
      ecart: 50,
    })
  })
})

describe('appliquerSuppressionVersement (invariant + garde reçu)', () => {
  function buildTx(montant: number, recu: unknown) {
    const contribution = { id: 'c1', montantVerse: montant, montantValorise: montant }
    const versement = { id: 'v1', contributionId: 'c1', montant }
    const tx: any = {
      versement: {
        findUnique: async () => ({ ...versement }),
        delete: async () => ({}),
      },
      contribution: {
        update: async ({ data }: any) => {
          if (data.montantVerse?.decrement) contribution.montantVerse -= data.montantVerse.decrement
          if (data.montantValorise?.decrement) contribution.montantValorise -= data.montantValorise.decrement
          return contribution
        },
      },
      recu: { findFirst: async () => recu },
    }
    return { tx, contribution }
  }

  it('décrémente montantVerse ET montantValorise du même montant', async () => {
    const { tx, contribution } = buildTx(500, null)
    await appliquerSuppressionVersement(tx, 'v1')
    expect(contribution).toMatchObject({ montantVerse: 0, montantValorise: 0 })
  })

  it('refuse (VersementAvecRecuError) si un reçu a été émis — aucune décrémentation', async () => {
    const { tx, contribution } = buildTx(500, { id: 'r1' })
    await expect(appliquerSuppressionVersement(tx, 'v1')).rejects.toBeInstanceOf(VersementAvecRecuError)
    expect(contribution).toMatchObject({ montantVerse: 500, montantValorise: 500 })
  })
})
