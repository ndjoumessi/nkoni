import { describe, it, expect } from 'vitest'
import { createSigner, createVerifier } from 'fast-jwt'
import { cleRateLimit, type RequeteRateLimit } from '../src/lib/rate-limit'

/**
 * Clé de rate-limit (roadmap 2.4). Derrière le proxy Vercel, `req.ip` est l'adresse de sortie de
 * Vercel pour TOUT le monde (mesuré en production) : une requête authentifiée doit être imputée à son
 * compte, sans jamais laisser un jeton FORGÉ ouvrir un seau neuf. Vérification RÉELLE de signature
 * (fast-jwt, la bibliothèque de @fastify/jwt) : un faux vérificateur prouverait moins.
 */
const SECRET = 'secret-de-test-rate-limit'
const signer = createSigner({ key: SECRET })
const verifier = createVerifier({ key: SECRET })
const verifierJeton = (jeton: string) => verifier(jeton) as { sub?: string; demo?: boolean }

const IP_VERCEL = '13.39.112.199'
const requete = (authorization?: string, rateLimitDeRoute?: object): RequeteRateLimit => ({
  ip: IP_VERCEL,
  headers: { authorization },
  routeOptions: { config: rateLimitDeRoute ? { rateLimit: rateLimitDeRoute } : {} },
})

describe('cleRateLimit', () => {
  it('requête authentifiée → clé du COMPTE, pas l’IP partagée du proxy', () => {
    const a = cleRateLimit(requete(`Bearer ${signer({ sub: 'u-a' })}`), verifierJeton)
    const b = cleRateLimit(requete(`Bearer ${signer({ sub: 'u-b' })}`), verifierJeton)
    expect(a).toBe('compte:u-a')
    expect(b).toBe('compte:u-b')
  })

  it('jeton FORGÉ (autre secret) → IP : un sub inventé n’ouvre aucun seau neuf', () => {
    const forge = createSigner({ key: 'secret-de-l-attaquant' })({ sub: 'u-a' })
    expect(cleRateLimit(requete(`Bearer ${forge}`), verifierJeton)).toBe(`ip:${IP_VERCEL}`)
  })

  it('jeton illisible ou schéma non Bearer → IP', () => {
    expect(cleRateLimit(requete('Bearer n-importe-quoi'), verifierJeton)).toBe(`ip:${IP_VERCEL}`)
    expect(cleRateLimit(requete(`Basic ${signer({ sub: 'u-a' })}`), verifierJeton)).toBe(`ip:${IP_VERCEL}`)
    expect(cleRateLimit(requete(), verifierJeton)).toBe(`ip:${IP_VERCEL}`)
  })

  it('route à budget propre (login, inscription, démo, webhooks) → IP même avec un jeton valide', () => {
    // Sinon plusieurs comptes multiplieraient le budget anti-force-brute.
    const jeton = `Bearer ${signer({ sub: 'u-a' })}`
    expect(cleRateLimit(requete(jeton, { max: 10 }), verifierJeton)).toBe(`ip:${IP_VERCEL}`)
  })

  it('jeton de démonstration → IP : tous les visiteurs partagent le même compte démo', () => {
    const jeton = `Bearer ${signer({ sub: 'u-demo', demo: true })}`
    expect(cleRateLimit(requete(jeton), verifierJeton)).toBe(`ip:${IP_VERCEL}`)
  })
})
