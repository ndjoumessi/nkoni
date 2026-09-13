import { afterEach, describe, expect, it, vi } from 'vitest'
import { bandeauForfait, estBandeauFerme, fermerBandeau } from './bandeau-forfait'

// Env `node` : règle pure ; `sessionStorage` y est ABSENT, ce qui teste aussi la tolérance d'accès.
const ORG = {
  id: 'org-1',
  forfait: 'PRO' as const,
  forfaitExpireLe: '2026-09-20T22:59:59.999Z',
  etatForfait: 'ECHEANCE_PROCHE' as const,
  joursRestants: 7,
}

describe('bandeauForfait (spec 1.1 §4.4)', () => {
  it('échéance proche à J ≤ 7 : info, fermable', () => {
    expect(bandeauForfait(ORG)).toMatchObject({ cle: 'proche', ton: 'info', fermable: true })
    expect(bandeauForfait({ ...ORG, joursRestants: 0 })).toMatchObject({ cle: 'proche' })
  })

  it('échéance proche de J-30 à J-8 : rien (la notification suffit)', () => {
    expect(bandeauForfait({ ...ORG, joursRestants: 8 })).toBeNull()
    expect(bandeauForfait({ ...ORG, joursRestants: 30 })).toBeNull()
  })

  it('grâce : or, NON fermable', () => {
    expect(bandeauForfait({ ...ORG, etatForfait: 'GRACE', joursRestants: -3 })).toMatchObject({
      cle: 'grace',
      ton: 'or',
      fermable: false,
    })
  })

  it('expiré sur forfait payant : neutre, fermable', () => {
    expect(bandeauForfait({ ...ORG, etatForfait: 'EXPIRE', joursRestants: -20 })).toMatchObject({
      cle: 'expire',
      ton: 'neutre',
      fermable: true,
    })
  })

  it('actif, sans échéance, ou champs absents (API pas encore déployée) : rien', () => {
    expect(bandeauForfait({ ...ORG, etatForfait: 'ACTIF', joursRestants: 60 })).toBeNull()
    expect(bandeauForfait({ ...ORG, etatForfait: 'SANS_ECHEANCE', forfaitExpireLe: null, joursRestants: null })).toBeNull()
    expect(bandeauForfait({ id: 'org-1', forfait: 'PRO' } as never)).toBeNull()
  })

  it('l’identifiant de fermeture change avec l’échéance et l’état : un nouvel état se ré-affiche', () => {
    const proche = bandeauForfait(ORG)!
    const grace = bandeauForfait({ ...ORG, etatForfait: 'GRACE', joursRestants: -1 })!
    const prolonge = bandeauForfait({ ...ORG, forfaitExpireLe: '2026-09-19T22:59:59.999Z' })!
    expect(grace.idFermeture).not.toBe(proche.idFermeture)
    expect(prolonge.idFermeture).not.toBe(proche.idFermeture)
  })
})

describe('fermeture de session', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stockage indisponible (accès qui lève) : jamais fermé, aucune exception', () => {
    expect(estBandeauFerme('x')).toBe(false)
    expect(() => fermerBandeau('x')).not.toThrow()
  })

  it('stockage disponible : fermer puis relire', () => {
    const memoire = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => memoire.get(k) ?? null,
      setItem: (k: string, v: string) => void memoire.set(k, v),
    })
    expect(estBandeauFerme('cle')).toBe(false)
    fermerBandeau('cle')
    expect(estBandeauFerme('cle')).toBe(true)
  })
})
