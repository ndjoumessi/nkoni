import { describe, expect, it } from 'vitest'
import { CAPACITES_FORFAIT, FORFAITS, limiteMembresForfait, type Forfait } from './forfait'

// Env `node` (défaut des *.test.ts) : fonctions pures, aucun rendu.
describe('limiteMembresForfait (miroir front)', () => {
  it.each(FORFAITS)('%s : dérive de la table', (forfait) => {
    expect(limiteMembresForfait(forfait)).toBe(CAPACITES_FORFAIT[forfait].limiteMembres)
  })

  it('comportement inchangé : Gratuit = 50, Pro et Entreprise illimités', () => {
    expect(limiteMembresForfait('GRATUIT')).toBe(50)
    expect(limiteMembresForfait('PRO')).toBeNull()
    expect(limiteMembresForfait('ENTREPRISE')).toBeNull()
  })

  it('forfait inconnu (API plus récente que le front) : illimité, comme le `default` historique', () => {
    expect(limiteMembresForfait('FUTUR' as Forfait)).toBeNull()
  })
})
