import { describe, it, expect } from 'vitest'
import {
  validerTransition,
  estEditable,
  calculerTresorerie,
  TransitionDepenseInvalideError,
  type StatutDepense,
} from '../src/services/tresorerie.service'

describe('validerTransition — workflow BROUILLON→EN_ATTENTE→APPROUVEE|REJETEE→PAYEE', () => {
  it('autorise les transitions valides', () => {
    expect(() => validerTransition('BROUILLON', 'EN_ATTENTE')).not.toThrow()
    expect(() => validerTransition('EN_ATTENTE', 'APPROUVEE')).not.toThrow()
    expect(() => validerTransition('EN_ATTENTE', 'REJETEE')).not.toThrow()
    expect(() => validerTransition('APPROUVEE', 'PAYEE')).not.toThrow()
  })
  it('refuse les transitions invalides', () => {
    expect(() => validerTransition('BROUILLON', 'APPROUVEE')).toThrow(TransitionDepenseInvalideError)
    expect(() => validerTransition('APPROUVEE', 'REJETEE')).toThrow(TransitionDepenseInvalideError)
    expect(() => validerTransition('PAYEE', 'EN_ATTENTE')).toThrow(TransitionDepenseInvalideError)
    expect(() => validerTransition('REJETEE', 'APPROUVEE')).toThrow(TransitionDepenseInvalideError)
  })
})

describe('estEditable', () => {
  it('BROUILLON/EN_ATTENTE éditables ; APPROUVEE/REJETEE/PAYEE figées', () => {
    const attendu: Record<StatutDepense, boolean> = {
      BROUILLON: true,
      EN_ATTENTE: true,
      APPROUVEE: false,
      REJETEE: false,
      PAYEE: false,
    }
    for (const [statut, ok] of Object.entries(attendu)) {
      expect(estEditable(statut as StatutDepense)).toBe(ok)
    }
  })
})

describe('calculerTresorerie — solde de caisse', () => {
  it('solde = entrées − sorties (APPROUVÉES/PAYÉES) ; ventilation triée desc', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const prisma: any = {
      versement: { aggregate: async () => ({ _sum: { montant: 100_000 } }) },
      depense: {
        groupBy: async () => [
          { categorie: 'AIDE_MEMBRE', _sum: { montant: 30_000 } },
          { categorie: 'FONCTIONNEMENT', _sum: { montant: 50_000 } },
        ],
      },
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const r = await calculerTresorerie(prisma)
    expect(r.entrees).toBe(100_000)
    expect(r.sorties).toBe(80_000)
    expect(r.solde).toBe(20_000)
    expect(r.parCategorie[0]).toEqual({ categorie: 'FONCTIONNEMENT', total: 50_000 }) // trié
  })

  it('borne la période (gte/lte) et ne compte que les sorties APPROUVÉES/PAYÉES', async () => {
    let wVers: unknown
    let wDep: { statut?: unknown; date?: unknown } = {}
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const prisma: any = {
      versement: { aggregate: async ({ where }: any) => { wVers = where; return { _sum: { montant: 0 } } } },
      depense: { groupBy: async ({ where }: any) => { wDep = where; return [] } },
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const d1 = new Date('2026-01-01')
    const d2 = new Date('2026-12-31')
    await calculerTresorerie(prisma, { dateDebut: d1, dateFin: d2 })
    expect(wVers).toEqual({ dateVersement: { gte: d1, lte: d2 } })
    expect(wDep.statut).toEqual({ in: ['APPROUVEE', 'PAYEE'] })
    expect(wDep.date).toEqual({ gte: d1, lte: d2 })
  })
})
