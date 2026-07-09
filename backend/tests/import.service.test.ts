import { describe, it, expect } from 'vitest'
import { analyserImport, executerImport, type LigneImport, type ImportPrisma } from '../src/services/import.service'

/**
 * Import de membres (§5.2) — service i18n-agnostique sur mocks Prisma. Couvre : aperçu avec
 * erreurs, commit OK (FK SCALAIRES), dépassement de quota, branche inconnue (+ création),
 * doublons (existant ET intra-fichier), isolation via l'extension (les mocks simulent le scope).
 */

const OPTS = { creerBranchesManquantes: false, anneeCourante: 2026, plafond: 100 }

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockPrisma(seed: { membres?: { nom: string; prenom: string }[]; branches?: string[] } = {}) {
  const membres = seed.membres ?? []
  const branches = (seed.branches ?? []).map((nom, i) => ({ id: `b${i}`, nom }))
  const ecrits = { membres: [] as any[], branches: [] as any[] }
  const prisma: ImportPrisma = {
    membre: {
      count: async () => membres.length,
      findMany: async () => membres.map((m) => ({ nom: m.nom, prenom: m.prenom })),
      createMany: async ({ data }: any) => {
        ecrits.membres.push(...data)
        return { count: data.length }
      },
    },
    brancheFamiliale: {
      findMany: async () => branches.map((b) => ({ id: b.id, nom: b.nom })),
      create: async ({ data }: any) => {
        const b = { id: `new-${data.nom}`, nom: data.nom }
        ecrits.branches.push(b)
        return b
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  }
  return { prisma, ecrits }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function codes(erreurs: { champ: string; code: string }[]) {
  return erreurs.map((e) => `${e.champ}:${e.code}`)
}

describe('analyserImport — validation (aperçu, aucune écriture)', () => {
  it('remonte une erreur typée par champ invalide', async () => {
    const lignes: LigneImport[] = [
      { nom: '', prenom: 'Alice', anneeAdhesion: 2020 }, // nom requis
      { nom: 'Wamba', prenom: '', anneeAdhesion: 2020 }, // prénom requis
      { nom: 'Kana', prenom: 'Paul', anneeAdhesion: 2999 }, // année future (> 2026, ≤ 2200 échoue d'abord)
      { nom: 'Ngo', prenom: 'Rita', anneeAdhesion: 2020, statut: 'PARTI' }, // statut invalide
      { nom: 'Fotso', prenom: 'Jean', anneeAdhesion: 2020, dateNaissance: 'pas-une-date' }, // date invalide
      { nom: 'Sop', prenom: 'Yves', anneeAdhesion: 2020, branche: 'Inconnue' }, // branche inconnue
    ]
    const { prisma } = mockPrisma()
    const { rapport } = await analyserImport(prisma, lignes, OPTS)

    expect(rapport.valides).toBe(0)
    expect(codes(rapport.erreurs)).toEqual([
      'nom:nomRequis',
      'prenom:prenomRequis',
      'anneeAdhesion:anneeInvalide',
      'statut:statutInvalide',
      'dateNaissance:dateInvalide',
      'branche:brancheInconnue',
    ])
    expect(rapport.erreurs[0]?.ligne).toBe(1)
    expect(rapport.erreurs[2]?.ligne).toBe(3)
  })
})

describe('executerImport — commit', () => {
  it('crée les membres en FK SCALAIRES (brancheId résolu, pas de { connect })', async () => {
    const lignes: LigneImport[] = [
      { nom: 'Tchoupa', prenom: 'Bernard', anneeAdhesion: 2018, branche: 'nord', statut: 'ACTIF' },
      { nom: 'Wamba', prenom: 'Alice', anneeAdhesion: '2020', telephone: '690000000' },
    ]
    const { prisma, ecrits } = mockPrisma({ branches: ['Nord'] })
    const analyse = await analyserImport(prisma, lignes, OPTS)
    expect(analyse.rapport.erreurs).toHaveLength(0)
    expect(analyse.rapport.valides).toBe(2)

    const res = await executerImport(prisma, analyse)
    expect(res).toEqual({ crees: 2, ignores: 0 })
    // Données scalaires : brancheId (résolu, insensible à la casse), aucune clé relation.
    expect(ecrits.membres[0]).toMatchObject({ nom: 'Tchoupa', prenom: 'Bernard', anneeAdhesion: 2018, brancheId: 'b0' })
    expect(ecrits.membres[0]).not.toHaveProperty('branche')
    expect(ecrits.membres[1]).toMatchObject({ nom: 'Wamba', anneeAdhesion: 2020 })
  })

  it('§4.1 : statut DECEDE sans anneeFinContribution → fin = année courante', async () => {
    const lignes: LigneImport[] = [{ nom: 'A', prenom: 'B', anneeAdhesion: 2010, statut: 'DECEDE' }]
    const { prisma, ecrits } = mockPrisma()
    const analyse = await analyserImport(prisma, lignes, OPTS)
    await executerImport(prisma, analyse)
    expect(ecrits.membres[0]).toMatchObject({ statut: 'DECEDE', anneeFinContribution: 2026 })
  })
})

describe('quota du plan gratuit', () => {
  it('count() + à créer > plafond → depasse=true', async () => {
    const existants = Array.from({ length: 99 }, (_, i) => ({ nom: `M${i}`, prenom: 'X' }))
    const lignes: LigneImport[] = [
      { nom: 'Nouveau1', prenom: 'A', anneeAdhesion: 2020 },
      { nom: 'Nouveau2', prenom: 'B', anneeAdhesion: 2020 },
    ]
    const { prisma } = mockPrisma({ membres: existants })
    const { rapport } = await analyserImport(prisma, lignes, OPTS)
    expect(rapport.quota).toMatchObject({ actuel: 99, plafond: 100, aCreer: 2, depasse: true })
  })

  it('exactement le plafond → depasse=false', async () => {
    const existants = Array.from({ length: 98 }, (_, i) => ({ nom: `M${i}`, prenom: 'X' }))
    const lignes: LigneImport[] = [
      { nom: 'N1', prenom: 'A', anneeAdhesion: 2020 },
      { nom: 'N2', prenom: 'B', anneeAdhesion: 2020 },
    ]
    const { prisma } = mockPrisma({ membres: existants })
    const { rapport } = await analyserImport(prisma, lignes, OPTS)
    expect(rapport.quota.depasse).toBe(false)
  })
})

describe('branche inconnue', () => {
  it('sans creerBranchesManquantes → erreur brancheInconnue', async () => {
    const lignes: LigneImport[] = [{ nom: 'A', prenom: 'B', anneeAdhesion: 2020, branche: 'Sud' }]
    const { prisma } = mockPrisma({ branches: ['Nord'] })
    const { rapport } = await analyserImport(prisma, lignes, OPTS)
    expect(codes(rapport.erreurs)).toEqual(['branche:brancheInconnue'])
  })

  it('avec creerBranchesManquantes → pas d’erreur, branche créée puis membre rattaché', async () => {
    const lignes: LigneImport[] = [
      { nom: 'A', prenom: 'B', anneeAdhesion: 2020, branche: 'Sud' },
      { nom: 'C', prenom: 'D', anneeAdhesion: 2020, branche: 'sud' }, // même branche, autre casse
    ]
    const { prisma, ecrits } = mockPrisma({ branches: ['Nord'] })
    const analyse = await analyserImport(prisma, lignes, { ...OPTS, creerBranchesManquantes: true })
    expect(analyse.rapport.erreurs).toHaveLength(0)
    expect(analyse.branchesACreer).toEqual(['Sud']) // dédupliqué, casse d'origine

    await executerImport(prisma, analyse)
    expect(ecrits.branches).toHaveLength(1)
    expect(ecrits.membres[0].brancheId).toBe('new-Sud')
    expect(ecrits.membres[1].brancheId).toBe('new-Sud') // même branche créée
  })
})

describe('doublons', () => {
  it('signale un doublon contre l’existant ET intra-fichier (non compté dans valides)', async () => {
    const lignes: LigneImport[] = [
      { nom: 'Tchoupa', prenom: 'Bernard', anneeAdhesion: 2018 }, // existe déjà (casse différente)
      { nom: 'Neuf', prenom: 'Un', anneeAdhesion: 2020 }, // valide
      { nom: 'neuf', prenom: 'un', anneeAdhesion: 2021 }, // doublon intra-fichier de la précédente
    ]
    const { prisma } = mockPrisma({ membres: [{ nom: 'TCHOUPA', prenom: 'bernard' }] })
    const { rapport, aCreer } = await analyserImport(prisma, lignes, OPTS)
    expect(rapport.valides).toBe(1)
    expect(rapport.doublons).toEqual([
      { ligne: 1, nom: 'Tchoupa', prenom: 'Bernard' },
      { ligne: 3, nom: 'neuf', prenom: 'un' },
    ])
    expect(aCreer).toHaveLength(1)
    expect(aCreer[0]).toMatchObject({ nom: 'Neuf', prenom: 'Un' })
  })
})
