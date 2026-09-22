import { describe, it, expect } from 'vitest'
import { createSigner, createVerifier } from 'fast-jwt'
import {
  ENTETE_IP_CLIENT,
  ENTETE_SECRET_PROXY,
  cleRateLimit,
  ipPourRateLimit,
  type RequeteRateLimit,
} from '../src/lib/rate-limit'

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
const IP_CLIENT = '41.202.219.7'
const SECRET_PROXY = 'secret-partage-avec-la-middleware'

const requete = (
  authorization?: string,
  rateLimitDeRoute?: object,
  entetesProxy?: Record<string, string | string[]>,
): RequeteRateLimit => ({
  ip: IP_VERCEL,
  headers: { authorization, ...entetesProxy },
  routeOptions: { config: rateLimitDeRoute ? { rateLimit: rateLimitDeRoute } : {} },
})

/** Ce que pose la Routing Middleware Vercel quand elle est en service. */
const proxifiee = (ip = IP_CLIENT, secret = SECRET_PROXY) => ({
  [ENTETE_IP_CLIENT]: ip,
  [ENTETE_SECRET_PROXY]: secret,
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

/**
 * IP du client transmise par la Routing Middleware Vercel sous secret partagé (roadmap 2.4, volet
 * anonyme). L'enjeu n'est PAS de faire marcher le cas nominal — c'est de ne jamais croire un
 * en-tête que n'importe qui peut poser en appelant Railway EN DIRECT. Un seau par IP inventée
 * viderait de son sens le budget anti-force-brute du login, qui est précisément ce que ce chantier
 * cherche à rendre utilisable.
 */
describe('ipPourRateLimit — l’IP annoncée n’est crue que sous secret', () => {
  it('secret concordant + IP valide → l’IP du CLIENT, pas celle du proxy', () => {
    expect(ipPourRateLimit(requete(undefined, undefined, proxifiee()), SECRET_PROXY)).toEqual({
      ip: IP_CLIENT,
      source: 'client',
    })
  })

  it('en-tête d’IP SANS secret → ignoré : c’est le cas de l’appel direct à Railway', () => {
    const forgee = requete(undefined, undefined, { [ENTETE_IP_CLIENT]: '1.2.3.4' })
    expect(ipPourRateLimit(forgee, SECRET_PROXY)).toEqual({ ip: IP_VERCEL, source: 'pair' })
  })

  it('secret FAUX → ignoré, y compris à longueur différente (la garde précède timingSafeEqual)', () => {
    for (const faux of ['pas-le-bon-secret-mais-meme-longueur-xx', 'court', `${SECRET_PROXY}x`]) {
      const req = requete(undefined, undefined, proxifiee(IP_CLIENT, faux))
      expect(ipPourRateLimit(req, SECRET_PROXY)).toEqual({ ip: IP_VERCEL, source: 'pair' })
    }
  })

  it('PROXY_SECRET absent de la configuration → aucun en-tête n’est cru (état d’avant)', () => {
    const req = requete(undefined, undefined, proxifiee())
    expect(ipPourRateLimit(req, undefined)).toEqual({ ip: IP_VERCEL, source: 'pair' })
    expect(ipPourRateLimit(req, '')).toEqual({ ip: IP_VERCEL, source: 'pair' })
  })

  it('IP non parsable → refusée : la valeur deviendrait une CLÉ du magasin de rate-limit', () => {
    for (const bidon of ['pas-une-ip', '', '1.2.3.4, 5.6.7.8', 'x'.repeat(5000)]) {
      const req = requete(undefined, undefined, proxifiee(bidon))
      expect(ipPourRateLimit(req, SECRET_PROXY)).toEqual({ ip: IP_VERCEL, source: 'pair' })
    }
  })

  it('IPv6 acceptée', () => {
    const req = requete(undefined, undefined, proxifiee('2a01:e0a:1f9:7bc0::1'))
    expect(ipPourRateLimit(req, SECRET_PROXY).source).toBe('client')
  })

  it('en-tête RÉPÉTÉ (tableau) → refusé : un secret n’a qu’une valeur', () => {
    const req = requete(undefined, undefined, {
      [ENTETE_IP_CLIENT]: IP_CLIENT,
      [ENTETE_SECRET_PROXY]: [SECRET_PROXY, 'autre'],
    })
    expect(ipPourRateLimit(req, SECRET_PROXY)).toEqual({ ip: IP_VERCEL, source: 'pair' })
  })
})

describe('cleRateLimit avec l’IP du client', () => {
  it('le LOGIN redevient par visiteur — c’est l’objet du chantier', () => {
    // Route à budget propre : la clé reste l'IP, mais ce n'est plus la même pour tout le monde.
    const a = cleRateLimit(requete(undefined, { max: 10 }, proxifiee('41.202.219.7')), verifierJeton, SECRET_PROXY)
    const b = cleRateLimit(requete(undefined, { max: 10 }, proxifiee('102.244.1.9')), verifierJeton, SECRET_PROXY)
    expect(a).toBe('ip:41.202.219.7')
    expect(b).toBe('ip:102.244.1.9')
    expect(a).not.toBe(b)
  })

  it('sans secret partagé, deux visiteurs retombent dans le MÊME seau (état d’avant)', () => {
    const a = cleRateLimit(requete(undefined, { max: 10 }, proxifiee('41.202.219.7')), verifierJeton)
    const b = cleRateLimit(requete(undefined, { max: 10 }, proxifiee('102.244.1.9')), verifierJeton)
    expect(a).toBe(b)
    expect(a).toBe(`ip:${IP_VERCEL}`)
  })

  it('le COMPTE reste prioritaire : l’IP du client ne le remplace pas', () => {
    const req = requete(`Bearer ${signer({ sub: 'u-a' })}`, undefined, proxifiee())
    expect(cleRateLimit(req, verifierJeton, SECRET_PROXY)).toBe('compte:u-a')
  })
})
