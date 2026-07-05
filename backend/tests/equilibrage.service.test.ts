import { describe, it, expect, vi } from 'vitest'
import {
  calculerRepartition,
  appliquerEquilibrage,
  simulerEquilibrage,
  EquilibragePlageInvalideError,
  EquilibrageAnneeManquanteError,
  EquilibrageSommeInvalideError,
  type EquilibragePrisma,
} from '../src/services/equilibrage.service'

/**
 * Tests unitaires de l'équilibrage (§4.3). Prisma mocké et STATEFUL pour prouver
 * la conservation de la somme et le fait que Versement n'est JAMAIS touché.
 */

/* -------------------------------------------------------------------------- */
/* Mock Prisma stateful                                                        */
/* -------------------------------------------------------------------------- */

interface MockContribution {
  id: string
  membreId: string
  annee: number
  montantVerse: number
  montantValorise: number
}

/**
 * Construit un mock Prisma stateful.
 * - `versementSpy` est branché sur TOUTES les méthodes versement.* : tout appel le
 *   déclenche → on prouve qu'aucune n'est jamais utilisée par l'équilibrage.
 */
function buildMock(initial: MockContribution[]) {
  const contributions = new Map<string, MockContribution>(
    initial.map((c) => [c.id, { ...c }]),
  )
  const equilibrages: Array<Record<string, unknown>> = []
  let seqEq = 0
  let seqDet = 0
  const versementSpy = vi.fn()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    contribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) => {
        let res = [...contributions.values()]
        if (where?.membreId) res = res.filter((c) => c.membreId === where.membreId)
        const gte = where?.annee?.gte
        const lte = where?.annee?.lte
        if (gte !== undefined) res = res.filter((c) => c.annee >= gte)
        if (lte !== undefined) res = res.filter((c) => c.annee <= lte)
        res.sort((a, b) => a.annee - b.annee)
        // Reproduit `select` : ne renvoie que id/annee/montantValorise.
        return res.map((c) => ({
          id: c.id,
          annee: c.annee,
          montantValorise: c.montantValorise,
        }))
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async ({ where, data }: any) => {
        const c = contributions.get(where.id)!
        // L'équilibrage REMPLACE montantValorise (jamais increment) et ne touche pas montantVerse.
        if (data.montantValorise !== undefined) c.montantValorise = data.montantValorise
        return { ...c }
      },
    },
    equilibrageContribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        // Les détails sont désormais créés séparément (equilibrageDetail.createMany top-level).
        const id = `eq${++seqEq}`
        const eq = {
          id,
          membreId: data.membreId,
          anneeDebut: data.anneeDebut,
          anneeFin: data.anneeFin,
          totalPeriode: data.totalPeriode,
          auteurId: data.auteurId,
          details: [] as any[],
        }
        equilibrages.push(eq)
        return eq
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => equilibrages.find((e) => e.id === where.id) ?? null,
      findMany: async () => equilibrages,
    },
    equilibrageDetail: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMany: async ({ data }: any) => {
        const rows: any[] = data ?? []
        for (const d of rows) {
          const eq = equilibrages.find((e) => e.id === d.equilibrageId)
          if (eq) eq.details.push({ id: `det${++seqDet}`, ...d })
        }
        return { count: rows.length }
      },
    },
    // Versement : toute méthode déclenche le spy → prouve la non-manipulation.
    versement: {
      create: versementSpy,
      update: versementSpy,
      delete: versementSpy,
      findMany: versementSpy,
      findUnique: versementSpy,
    },
    // $transaction interactif : passe le client lui-même comme tx.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(client),
  }

  return { prisma: client as EquilibragePrisma, contributions, equilibrages, versementSpy }
}

const somme = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

/* -------------------------------------------------------------------------- */
/* calculerRepartition (fonction pure)                                        */
/* -------------------------------------------------------------------------- */

describe('calculerRepartition (§4.3 point 3)', () => {
  it('division exacte : montants égaux, somme conservée', () => {
    const r = calculerRepartition(1200, 4)
    expect(r).toEqual([300, 300, 300, 300])
    expect(somme(r)).toBe(1200)
  })

  it('reliquat 1000/3 : arrondi + reliquat sur la dernière année, somme EXACTE', () => {
    const r = calculerRepartition(1000, 3)
    expect(r).toEqual([333, 333, 334]) // 333 + 333 + 334 = 1000
    expect(somme(r)).toBe(1000)
  })

  it('reliquat négatif possible : arrondi supérieur reporté sur la dernière (100/3)', () => {
    const r = calculerRepartition(100, 3)
    // round(33.33) = 33 → [33, 33, 34]
    expect(r).toEqual([33, 33, 34])
    expect(somme(r)).toBe(100)
  })

  it('cas où l’arrondi dépasse : 10/3 → dernière année absorbe (peut être < base)', () => {
    // round(3.33) = 3 → [3, 3, 4]
    expect(calculerRepartition(10, 3)).toEqual([3, 3, 4])
    // 20/3 : round(6.67)=7 → [7,7,6], somme 20
    const r = calculerRepartition(20, 3)
    expect(r).toEqual([7, 7, 6])
    expect(somme(r)).toBe(20)
  })

  it('une seule année : reçoit tout le total', () => {
    expect(calculerRepartition(777, 1)).toEqual([777])
  })

  it('total 0 : que des zéros', () => {
    expect(calculerRepartition(0, 5)).toEqual([0, 0, 0, 0, 0])
  })

  it('propriété : Σ === totalPeriode pour un balayage de totaux et de tailles', () => {
    for (let n = 1; n <= 7; n++) {
      for (let total = 0; total <= 100; total += 7) {
        expect(somme(calculerRepartition(total, n))).toBe(total)
      }
    }
  })

  it('nombreAnnees < 1 → EquilibragePlageInvalideError', () => {
    expect(() => calculerRepartition(100, 0)).toThrow(EquilibragePlageInvalideError)
  })
})

/* -------------------------------------------------------------------------- */
/* appliquerEquilibrage — répartition proposée                                */
/* -------------------------------------------------------------------------- */

describe('appliquerEquilibrage — application transactionnelle (§4.3 point 5)', () => {
  it('crée les EquilibrageDetail (avant/après) et met à jour montantValorise, sans toucher Versement', async () => {
    // 3 années, versements réels irréguliers : 10000 / 0 / 5000 → total 15000.
    const { prisma, contributions, equilibrages, versementSpy } = buildMock([
      { id: 'c20', membreId: 'm1', annee: 2020, montantVerse: 10_000, montantValorise: 10_000 },
      { id: 'c21', membreId: 'm1', annee: 2021, montantVerse: 0, montantValorise: 0 },
      { id: 'c22', membreId: 'm1', annee: 2022, montantVerse: 5_000, montantValorise: 5_000 },
    ])

    const { equilibrage, totalPeriode } = await appliquerEquilibrage(prisma, {
      membreId: 'm1',
      anneeDebut: 2020,
      anneeFin: 2022,
      auteurId: 'u-tres',
    })

    // Total conservé et lissé : 15000/3 = 5000 pile.
    expect(totalPeriode).toBe(15_000)
    expect(contributions.get('c20')!.montantValorise).toBe(5_000)
    expect(contributions.get('c21')!.montantValorise).toBe(5_000)
    expect(contributions.get('c22')!.montantValorise).toBe(5_000)

    // montantVerse (historique réel) INCHANGÉ.
    expect(contributions.get('c20')!.montantVerse).toBe(10_000)
    expect(contributions.get('c21')!.montantVerse).toBe(0)
    expect(contributions.get('c22')!.montantVerse).toBe(5_000)

    // EquilibrageDetail : montantAvant = valorisation initiale, montantApres = nouvelle.
    expect(equilibrages).toHaveLength(1)
    expect(equilibrage.details).toEqual([
      expect.objectContaining({ annee: 2020, montantAvant: 10_000, montantApres: 5_000 }),
      expect.objectContaining({ annee: 2021, montantAvant: 0, montantApres: 5_000 }),
      expect.objectContaining({ annee: 2022, montantAvant: 5_000, montantApres: 5_000 }),
    ])

    // Versement JAMAIS touché.
    expect(versementSpy).not.toHaveBeenCalled()

    // Σ montantValorise === Σ montantVerse (la valorisation totale = versé total).
    const totVal = [...contributions.values()].reduce((s, c) => s + c.montantValorise, 0)
    const totVerse = [...contributions.values()].reduce((s, c) => s + c.montantVerse, 0)
    expect(totVal).toBe(totVerse)
  })

  it('répartition avec reliquat : la dernière année absorbe, somme conservée', async () => {
    const { prisma, contributions } = buildMock([
      { id: 'a', membreId: 'm1', annee: 2020, montantVerse: 400, montantValorise: 400 },
      { id: 'b', membreId: 'm1', annee: 2021, montantVerse: 300, montantValorise: 300 },
      { id: 'c', membreId: 'm1', annee: 2022, montantVerse: 300, montantValorise: 300 },
    ])
    // total 1000 / 3 → [333, 333, 334]
    await appliquerEquilibrage(prisma, {
      membreId: 'm1',
      anneeDebut: 2020,
      anneeFin: 2022,
      auteurId: 'u',
    })
    expect(contributions.get('a')!.montantValorise).toBe(333)
    expect(contributions.get('b')!.montantValorise).toBe(333)
    expect(contributions.get('c')!.montantValorise).toBe(334)
  })
})

/* -------------------------------------------------------------------------- */
/* appliquerEquilibrage — montants ajustés                                    */
/* -------------------------------------------------------------------------- */

describe('appliquerEquilibrage — ajustement manuel (§4.3 point 4)', () => {
  it('accepte des montants ajustés dont la somme === totalPeriode', async () => {
    const { prisma, contributions } = buildMock([
      { id: 'a', membreId: 'm1', annee: 2020, montantVerse: 600, montantValorise: 600 },
      { id: 'b', membreId: 'm1', annee: 2021, montantVerse: 400, montantValorise: 400 },
    ])
    // total 1000 ; ajusté 700/300 (somme 1000 OK).
    await appliquerEquilibrage(prisma, {
      membreId: 'm1',
      anneeDebut: 2020,
      anneeFin: 2021,
      montantsAjustes: [700, 300],
      auteurId: 'u',
    })
    expect(contributions.get('a')!.montantValorise).toBe(700)
    expect(contributions.get('b')!.montantValorise).toBe(300)
  })

  it('REJETTE si Σ montantsAjustes !== totalPeriode (rien écrit)', async () => {
    const { prisma, contributions, equilibrages } = buildMock([
      { id: 'a', membreId: 'm1', annee: 2020, montantVerse: 600, montantValorise: 600 },
      { id: 'b', membreId: 'm1', annee: 2021, montantVerse: 400, montantValorise: 400 },
    ])
    // total 1000, ajusté 700 + 400 = 1100 ≠ 1000.
    await expect(
      appliquerEquilibrage(prisma, {
        membreId: 'm1',
        anneeDebut: 2020,
        anneeFin: 2021,
        montantsAjustes: [700, 400],
        auteurId: 'u',
      }),
    ).rejects.toBeInstanceOf(EquilibrageSommeInvalideError)

    // Aucune écriture : valorisations inchangées, aucun équilibrage créé.
    expect(contributions.get('a')!.montantValorise).toBe(600)
    expect(contributions.get('b')!.montantValorise).toBe(400)
    expect(equilibrages).toHaveLength(0)
  })

  it('REJETTE si le nombre de montants ajustés ne couvre pas la plage', async () => {
    const { prisma } = buildMock([
      { id: 'a', membreId: 'm1', annee: 2020, montantVerse: 600, montantValorise: 600 },
      { id: 'b', membreId: 'm1', annee: 2021, montantVerse: 400, montantValorise: 400 },
    ])
    await expect(
      appliquerEquilibrage(prisma, {
        membreId: 'm1',
        anneeDebut: 2020,
        anneeFin: 2021,
        montantsAjustes: [1000], // 1 valeur pour 2 années
        auteurId: 'u',
      }),
    ).rejects.toBeInstanceOf(EquilibrageSommeInvalideError)
  })

  it('REJETTE une année manquante dans la plage', async () => {
    const { prisma } = buildMock([
      { id: 'a', membreId: 'm1', annee: 2020, montantVerse: 600, montantValorise: 600 },
      // 2021 absente
      { id: 'c', membreId: 'm1', annee: 2022, montantVerse: 400, montantValorise: 400 },
    ])
    await expect(
      appliquerEquilibrage(prisma, {
        membreId: 'm1',
        anneeDebut: 2020,
        anneeFin: 2022,
        auteurId: 'u',
      }),
    ).rejects.toBeInstanceOf(EquilibrageAnneeManquanteError)
  })
})

/* -------------------------------------------------------------------------- */
/* CHEVAUCHEMENT — l'exigence la plus subtile (§0 + §4.3 point 6)             */
/* -------------------------------------------------------------------------- */

describe('appliquerEquilibrage — chevauchement (§4.3 point 6, arbitrage §0)', () => {
  it('un 2e équilibrage repart de l’état COURANT ; Σ versée conservée globalement', async () => {
    // 4 années 2020..2023. Versements réels : 12000 / 0 / 0 / 4000 → total réel 16000.
    const { prisma, contributions, equilibrages, versementSpy } = buildMock([
      { id: 'c20', membreId: 'm1', annee: 2020, montantVerse: 12_000, montantValorise: 12_000 },
      { id: 'c21', membreId: 'm1', annee: 2021, montantVerse: 0, montantValorise: 0 },
      { id: 'c22', membreId: 'm1', annee: 2022, montantVerse: 0, montantValorise: 0 },
      { id: 'c23', membreId: 'm1', annee: 2023, montantVerse: 4_000, montantValorise: 4_000 },
    ])

    const totVerseInitial = [...contributions.values()].reduce((s, c) => s + c.montantVerse, 0)

    // --- Équilibrage 1 sur [2020, 2022] : total 12000 → 4000 chacun.
    const eq1 = await appliquerEquilibrage(prisma, {
      membreId: 'm1',
      anneeDebut: 2020,
      anneeFin: 2022,
      auteurId: 'u',
    })
    expect(eq1.totalPeriode).toBe(12_000)
    expect(contributions.get('c20')!.montantValorise).toBe(4_000)
    expect(contributions.get('c21')!.montantValorise).toBe(4_000)
    expect(contributions.get('c22')!.montantValorise).toBe(4_000)
    expect(contributions.get('c23')!.montantValorise).toBe(4_000) // hors plage : intact

    // --- Équilibrage 2 sur [2021, 2023] : DOIT repartir des valeurs COURANTES
    //     (4000, 4000, 4000) et NON des valeurs d'origine (0, 0, 4000).
    const eq2 = await appliquerEquilibrage(prisma, {
      membreId: 'm1',
      anneeDebut: 2021,
      anneeFin: 2023,
      auteurId: 'u',
    })
    // Preuve que le 2e part de l'état courant : total = 4000+4000+4000 = 12000 (PAS 0+0+4000=4000).
    expect(eq2.totalPeriode).toBe(12_000)
    // montantAvant de la 1re ligne (2021) = 4000 (déjà lissé par eq1), pas 0.
    expect(eq2.equilibrage.details[0]).toMatchObject({
      annee: 2021,
      montantAvant: 4_000,
    })
    // 12000/3 = 4000 chacun.
    expect(contributions.get('c21')!.montantValorise).toBe(4_000)
    expect(contributions.get('c22')!.montantValorise).toBe(4_000)
    expect(contributions.get('c23')!.montantValorise).toBe(4_000)
    expect(contributions.get('c20')!.montantValorise).toBe(4_000) // hors plage du 2e : intact

    // --- INVARIANT GLOBAL : malgré 2 équilibrages qui se chevauchent, la somme
    //     réellement versée est conservée, et Σ montantValorise === Σ montantVerse.
    const totVerseFinal = [...contributions.values()].reduce((s, c) => s + c.montantVerse, 0)
    const totValFinal = [...contributions.values()].reduce((s, c) => s + c.montantValorise, 0)
    expect(totVerseFinal).toBe(totVerseInitial) // 16000, jamais bougé
    expect(totVerseFinal).toBe(16_000)
    expect(totValFinal).toBe(16_000) // 4000×4 — la valorisation totale = le versé total

    // Deux équilibrages tracés, Versement jamais touché sur toute la séquence.
    expect(equilibrages).toHaveLength(2)
    expect(versementSpy).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* simulerEquilibrage — aucune écriture                                       */
/* -------------------------------------------------------------------------- */

describe('simulerEquilibrage — preview pure (§4.3, /simuler)', () => {
  it('retourne la répartition proposée SANS écrire (valorisations inchangées)', async () => {
    const { prisma, contributions, equilibrages, versementSpy } = buildMock([
      { id: 'a', membreId: 'm1', annee: 2020, montantVerse: 400, montantValorise: 400 },
      { id: 'b', membreId: 'm1', annee: 2021, montantVerse: 300, montantValorise: 300 },
      { id: 'c', membreId: 'm1', annee: 2022, montantVerse: 300, montantValorise: 300 },
    ])
    const sim = await simulerEquilibrage(prisma, {
      membreId: 'm1',
      anneeDebut: 2020,
      anneeFin: 2022,
    })
    expect(sim.totalPeriode).toBe(1000)
    expect(sim.nombreAnnees).toBe(3)
    expect(sim.repartition).toEqual([
      { annee: 2020, montantAvant: 400, montantPropose: 333 },
      { annee: 2021, montantAvant: 300, montantPropose: 333 },
      { annee: 2022, montantAvant: 300, montantPropose: 334 },
    ])
    // RIEN écrit.
    expect(contributions.get('a')!.montantValorise).toBe(400)
    expect(equilibrages).toHaveLength(0)
    expect(versementSpy).not.toHaveBeenCalled()
  })
})
