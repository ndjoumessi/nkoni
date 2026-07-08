import { describe, expect, it } from 'vitest'
import { resumeMembres } from './membres'
import type { StatutContribution, StatutMembre } from './api'

/**
 * Compteurs de la page Membres : les statuts de cotisation (« À jour »/« Non à jour ») ne portent
 * que sur les membres ACTIF. Un DECEDE/INACTIF n'est compté que dans « Inactifs/Décédés » — fin du
 * double-comptage constaté (un décédé apparaissait à la fois en « Non à jour » et « Inactifs »).
 */

const m = (statut: StatutMembre, statutCotisation: StatutContribution) => ({ statut, statutCotisation })

describe('resumeMembres', () => {
  it('un DECEDE non à jour ne compte PAS dans « Non à jour », mais bien dans « Inactifs/Décédés »', () => {
    const r = resumeMembres([
      m('ACTIF', 'NON_A_JOUR'),
      m('DECEDE', 'NON_A_JOUR'), // arriérés cumulés, mais plus d'obligation active
    ])
    expect(r.nonAJour).toBe(1) // seulement l'actif
    expect(r.inactifs).toBe(1) // le décédé
    expect(r.total).toBe(2)
    expect(r.actifs).toBe(1)
  })

  it('un ACTIF non à jour continue d’apparaître normalement dans « Non à jour »', () => {
    const r = resumeMembres([m('ACTIF', 'NON_A_JOUR'), m('ACTIF', 'A_JOUR')])
    expect(r.nonAJour).toBe(1)
    expect(r.aJour).toBe(1)
    expect(r.inactifs).toBe(0)
  })

  it('un INACTIF, même « à jour », n’est pas compté dans « À jour » (hors population éligible)', () => {
    const r = resumeMembres([m('INACTIF', 'A_JOUR'), m('ACTIF', 'A_JOUR')])
    expect(r.aJour).toBe(1) // seulement l'actif
    expect(r.actifs).toBe(1)
    expect(r.inactifs).toBe(1)
  })

  it('synthèse complète : total = tous, actifs/aJour/nonAJour = ACTIF uniquement', () => {
    const r = resumeMembres([
      m('ACTIF', 'A_JOUR'),
      m('ACTIF', 'NON_A_JOUR'),
      m('ACTIF', 'PARTIEL'), // ni à jour ni non à jour
      m('DECEDE', 'NON_A_JOUR'),
      m('INACTIF', 'A_JOUR'),
    ])
    expect(r).toEqual({ total: 5, actifs: 3, aJour: 1, nonAJour: 1, inactifs: 2 })
  })

  it('liste vide → tout à zéro', () => {
    expect(resumeMembres([])).toEqual({ total: 0, actifs: 0, aJour: 0, nonAJour: 0, inactifs: 0 })
  })
})
