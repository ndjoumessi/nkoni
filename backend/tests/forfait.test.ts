import { describe, expect, it } from 'vitest'
import { CAPACITES_FORFAIT, FORFAITS, limiteMembresForfait } from '../src/lib/forfait'

/**
 * Capacités par forfait (spec 1.1 §1.2) — source UNIQUE `lib/forfait.ts`. Les valeurs sont écrites EN
 * CLAIR ici (pas recalculées depuis la table) : c'est la spécification qu'on vérifie, pas une tautologie.
 */
const MO = 1024 * 1024
const GO = 1024 * MO

describe('CAPACITES_FORFAIT', () => {
  it('porte exactement les valeurs de la spécification', () => {
    expect(CAPACITES_FORFAIT).toEqual({
      GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
      PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
      ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
    })
  })

  it('couvre chaque forfait, sans en oublier ni en inventer', () => {
    expect(Object.keys(CAPACITES_FORFAIT).sort()).toEqual([...FORFAITS].sort())
  })
})

describe('limiteMembresForfait', () => {
  it.each(FORFAITS)('%s : dérive de la table', (forfait) => {
    expect(limiteMembresForfait(forfait)).toBe(CAPACITES_FORFAIT[forfait].limiteMembres)
  })

  it('comportement inchangé : Gratuit = 50, Pro et Entreprise illimités', () => {
    expect(limiteMembresForfait('GRATUIT')).toBe(50)
    expect(limiteMembresForfait('PRO')).toBeNull()
    expect(limiteMembresForfait('ENTREPRISE')).toBeNull()
  })
})
