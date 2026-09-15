import { describe, it, expect } from 'vitest'
import { ECRITURES_AUTORISEES_EN_DEMO, estRequeteAutoriseeEnDemo } from '../src/lib/demo'

describe('estRequeteAutoriseeEnDemo (spec 2026-09-15 §1.4)', () => {
  it.each(['GET', 'HEAD', 'get'])('%s : toujours permis (lecture)', (methode) => {
    expect(estRequeteAutoriseeEnDemo(methode, '/membres')).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s sur une route quelconque : refusé', (methode) => {
    expect(estRequeteAutoriseeEnDemo(methode, '/membres')).toBe(false)
  })

  it('POST /equilibrages/simuler : permis (calcul pur, aucune écriture)', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages/simuler')).toBe(true)
  })

  it('exception EXACTE : ni la route voisine qui applique, ni une autre méthode sur la même route', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages')).toBe(false)
    expect(estRequeteAutoriseeEnDemo('PUT', '/equilibrages/simuler')).toBe(false)
  })

  it('motif de route inconnu (404 Fastify) : refusé pour une écriture', () => {
    expect(estRequeteAutoriseeEnDemo('POST', undefined)).toBe(false)
  })

  it("la liste d'exceptions reste minimale (toute entrée ajoutée doit être relue)", () => {
    expect(ECRITURES_AUTORISEES_EN_DEMO).toEqual(['POST /equilibrages/simuler'])
  })
})
