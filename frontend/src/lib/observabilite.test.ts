import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'
import { estIncidentDigneDAlerte, observabiliteActive, signaler } from '@/lib/observabilite'

/**
 * OBSERVABILITÉ FRONT (bloquant GA 0.1) — le tri du bruit est la partie qui compte.
 *
 * Sur une PWA utilisée en mobilité, les erreurs réseau et les refus métier sont ATTENDUS. Les
 * remonter noierait les vrais incidents : le filtre `estIncidentDigneDAlerte` est donc la pièce
 * à verrouiller par des tests, plus encore que l'envoi lui-même.
 */

describe('estIncidentDigneDAlerte — trier le bruit du vrai incident', () => {
  it('ignore un refus métier (409) : le système fonctionne, l’utilisateur a déjà un message', () => {
    expect(estIncidentDigneDAlerte(new ApiError(409, 'Reçu déjà émis'))).toBe(false)
  })

  it('ignore une validation (400) et une authentification expirée (401)', () => {
    expect(estIncidentDigneDAlerte(new ApiError(400, 'Champ manquant'))).toBe(false)
    expect(estIncidentDigneDAlerte(new ApiError(401, 'Non autorisé'))).toBe(false)
  })

  it('SIGNALE une 500 : là, l’API est réellement cassée', () => {
    expect(estIncidentDigneDAlerte(new ApiError(500, 'Erreur serveur'))).toBe(true)
  })

  it('ignore une coupure réseau (attendue hors-ligne, gérée par la file de synchro)', () => {
    expect(estIncidentDigneDAlerte(new TypeError('Failed to fetch'))).toBe(false)
    expect(estIncidentDigneDAlerte(new TypeError('NetworkError when attempting to fetch'))).toBe(false)
  })

  it('SIGNALE une erreur de programmation (bug de rendu, TypeError non réseau)', () => {
    expect(estIncidentDigneDAlerte(new TypeError("Cannot read properties of undefined"))).toBe(true)
    expect(estIncidentDigneDAlerte(new Error('boum'))).toBe(true)
  })
})

describe('inerte sans VITE_SENTRY_DSN', () => {
  it('observabiliteActive() = false quand la variable n’est pas posée', () => {
    // L'environnement de test ne définit pas VITE_SENTRY_DSN.
    expect(observabiliteActive()).toBe(false)
  })

  it('signaler() ne lève jamais, configuré ou non', () => {
    expect(() => signaler(new Error('x'))).not.toThrow()
    expect(() => signaler(new ApiError(500, 'y'), { ecran: 'versements' })).not.toThrow()
    expect(() => signaler(undefined)).not.toThrow()
  })
})
