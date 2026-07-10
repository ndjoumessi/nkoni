import { describe, it, expect } from 'vitest'
import { classifierEchec } from './offline-sync'
import { ApiError } from './api'

/** classifierEchec : ApiError (réponse serveur) = client ; rejet fetch = réseau. */
describe('classifierEchec', () => {
  it('ApiError (4xx/5xx) → client (ne pas rejouer en boucle)', () => {
    expect(classifierEchec(new ApiError(409, 'Conflit'))).toBe('client')
    expect(classifierEchec(new ApiError(400, 'Invalide'))).toBe('client')
  })
  it('rejet fetch (TypeError réseau) → reseau (rejeu ultérieur)', () => {
    expect(classifierEchec(new TypeError('Failed to fetch'))).toBe('reseau')
    expect(classifierEchec(new Error('offline'))).toBe('reseau')
  })
})
