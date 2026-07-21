import { describe, it, expect } from 'vitest'
import {
  appliquerSuppressionVersement,
  appliquerModificationVersement,
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

/**
 * Mock partagé : le `recu.findFirst` HONORE la clause `annuleLe: null`, car les deux gardes
 * n'interrogent PAS le même ensemble — la MODIFICATION ne regarde que les reçus actifs (l'annulation
 * la débloque), la SUPPRESSION les regarde tous (la FK `Restrict` ignore `annuleLe`).
 *
 * Rappel de portée : ce mock n'a pas de clé étrangère. Il vérifie que la garde APPLICATIVE
 * interroge le bon ensemble, jamais que la base l'accepterait — c'est le rôle du test
 * d'intégration `versement-suppression-recu.integration.test.ts`, sur vraie Postgres.
 */
function buildTx(
  montant: number,
  recus: { id: string; numero?: string; annuleLe: Date | null }[],
) {
  const contribution = { id: 'c1', montantVerse: montant, montantValorise: montant }
  const versement = { id: 'v1', contributionId: 'c1', montant }
  const tx: any = {
    versement: {
      findUnique: async () => ({ ...versement }),
      delete: async () => ({}),
      update: async ({ data }: any) => ({ ...versement, ...data }),
    },
    contribution: {
      update: async ({ data }: any) => {
        if (data.montantVerse?.decrement) contribution.montantVerse -= data.montantVerse.decrement
        if (data.montantValorise?.decrement) contribution.montantValorise -= data.montantValorise.decrement
        if (data.montantVerse?.increment) contribution.montantVerse += data.montantVerse.increment
        if (data.montantValorise?.increment) contribution.montantValorise += data.montantValorise.increment
        return contribution
      },
    },
    recu: {
      findFirst: async ({ where }: any) => {
        const trouve = recus.find(
          (r) => (where?.annuleLe === null ? r.annuleLe === null : true),
        )
        return trouve ? { numero: 'NKONI-2026-000001', ...trouve } : null
      },
    },
  }
  return { tx, contribution }
}

describe('appliquerSuppressionVersement (invariant + garde reçu)', () => {
  it('décrémente montantVerse ET montantValorise du même montant', async () => {
    const { tx, contribution } = buildTx(500, [])
    await appliquerSuppressionVersement(tx, 'v1')
    expect(contribution).toMatchObject({ montantVerse: 0, montantValorise: 0 })
  })

  it('refuse (VersementAvecRecuError) si un reçu ACTIF existe — aucune décrémentation', async () => {
    const { tx, contribution } = buildTx(500, [{ id: 'r1', annuleLe: null }])
    await expect(appliquerSuppressionVersement(tx, 'v1')).rejects.toBeInstanceOf(VersementAvecRecuError)
    expect(contribution).toMatchObject({ montantVerse: 500, montantValorise: 500 })
  })

  /**
   * RÉGRESSION (prod 2026-07-21) — ce test affirmait l'INVERSE : « autorise la suppression si le
   * seul reçu est annulé ». Il passait, sur un `tx` MOCKÉ donc sans clé étrangère — alors que la
   * FK `Recu.versementId` est `onDelete: Restrict` INCONDITIONNEL. En production la garde laissait
   * passer, la base refusait, et l'utilisateur voyait « une erreur inattendue s'est produite ».
   * Le vert d'un test sur mock ne prouve pas un invariant porté par le schéma.
   */
  it('refuse AUSSI la suppression si le seul reçu est ANNULÉ (la FK Restrict ignore annuleLe)', async () => {
    const { tx, contribution } = buildTx(500, [{ id: 'r1', annuleLe: new Date('2026-07-19') }])
    await expect(appliquerSuppressionVersement(tx, 'v1')).rejects.toBeInstanceOf(
      VersementAvecRecuError,
    )
    expect(contribution).toMatchObject({ montantVerse: 500, montantValorise: 500 })
  })

  it('nomme le reçu en cause dans l’erreur (la route en fait un 409 explicite)', async () => {
    const { tx } = buildTx(500, [{ id: 'r1', annuleLe: null }])
    await expect(appliquerSuppressionVersement(tx, 'v1')).rejects.toMatchObject({
      numero: 'NKONI-2026-000001',
    })
  })
})

/**
 * Garde SYMÉTRIQUE sur la modification : sans elle, on pouvait changer le montant d'un versement
 * dont le reçu numéroté était déjà remis au membre — le reçu se mettait à mentir.
 */
describe('appliquerModificationVersement (garde reçu symétrique)', () => {
  it('refuse la modification tant qu’un reçu ACTIF existe', async () => {
    const { tx, contribution } = buildTx(500, [{ id: 'r1', annuleLe: null }])
    await expect(
      appliquerModificationVersement(tx, 'v1', { montant: 900 }),
    ).rejects.toBeInstanceOf(VersementAvecRecuError)
    // Le compteur ne bouge pas : la garde intervient AVANT toute écriture.
    expect(contribution).toMatchObject({ montantVerse: 500, montantValorise: 500 })
  })

  it('autorise la modification une fois le reçu annulé, et reporte le DELTA', async () => {
    const { tx, contribution } = buildTx(500, [{ id: 'r1', annuleLe: new Date('2026-07-19') }])
    await appliquerModificationVersement(tx, 'v1', { montant: 900 })
    expect(contribution).toMatchObject({ montantVerse: 900, montantValorise: 900 })
  })

  it('autorise la modification quand aucun reçu n’a jamais été émis', async () => {
    const { tx, contribution } = buildTx(500, [])
    await appliquerModificationVersement(tx, 'v1', { montant: 200 })
    expect(contribution).toMatchObject({ montantVerse: 200, montantValorise: 200 })
  })
})
