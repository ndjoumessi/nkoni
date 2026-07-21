import { describe, it, expect } from 'vitest'
import {
  genererRecu,
  genererNumeroSequentiel,
  formaterNumero,
  annulerRecu,
  VersementIntrouvableError,
  RecuDejaAnnuleError,
  RecuIntrouvableError,
  RecuActifExistantError,
  type RecuPrisma,
} from '../src/services/recu.service'

/**
 * Tests unitaires de la génération de reçu (§4.6). Prisma mocké et STATEFUL pour prouver
 * la séquentialité et l'unicité des numéros. Aucune génération de PDF (urlPdf = null).
 */

/* -------------------------------------------------------------------------- */
/* Mock Prisma stateful (l'index UNIQUE sur numero est simulé)                */
/* -------------------------------------------------------------------------- */

interface MockRecu {
  id: string
  versementId: string
  numero: string
  genereParId: string
  dateGeneration: Date
  urlPdf: string | null
  /** `null` = reçu ACTIF (défaut à la création). */
  annuleLe?: Date | null
}

function buildMock(versementIds: string[] = ['v1']) {
  // Le versement doit porter tout ce que `genererRecu` FIGE sur le reçu (snapshot) : sans la
  // relation `contribution`, la génération planterait sur `versement.contribution.membreId`.
  const versements = new Map(
    versementIds.map((id) => [
      id,
      {
        id,
        montant: 12000,
        dateVersement: new Date('2026-06-01T00:00:00Z'),
        mode: 'ESPECES',
        contribution: { membreId: 'm1', annee: 2026 },
      },
    ]),
  )
  const recus = new Map<string, MockRecu>()
  let seq = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    versement: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => versements.get(where.id) ?? null,
    },
    recu: {
      // Deux formes d'appel : recherche du reçu ACTIF d'un versement (contrainte « un seul actif »)
      // ou lecture du dernier numéro de l'année (numérotation séquentielle).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async ({ where }: any) => {
        if (where.versementId !== undefined) {
          const actif = [...recus.values()].find(
            (r) => r.versementId === where.versementId && (r.annuleLe ?? null) === null,
          )
          return actif ? { numero: actif.numero } : null
        }
        const prefixe: string = where.numero.startsWith
        const matching = [...recus.values()]
          .filter((r) => r.numero.startsWith(prefixe))
          .sort((a, b) => (a.numero < b.numero ? 1 : -1)) // desc (lexicographique == numérique)
        return matching[0] ? { numero: matching[0].numero } : null
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        // Simule l'index UNIQUE Recu_numero_key : rejette un numéro déjà pris (P2002).
        for (const r of recus.values()) {
          if (r.numero === data.numero) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
          }
        }
        const rec: MockRecu = { id: `r${++seq}`, urlPdf: null, annuleLe: null, ...data }
        recus.set(rec.id, rec)
        return { ...rec }
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(prisma),
  }

  return { prisma: prisma as RecuPrisma, versements, recus }
}

/* -------------------------------------------------------------------------- */
/* formaterNumero / genererNumeroSequentiel                                  */
/* -------------------------------------------------------------------------- */

describe('formaterNumero (§4.6)', () => {
  it('formate NKONI-{annee}-{sequence sur 6 chiffres}', () => {
    expect(formaterNumero(2026, 1)).toBe('NKONI-2026-000001')
    expect(formaterNumero(2026, 123)).toBe('NKONI-2026-000123')
  })
})

describe('genererNumeroSequentiel', () => {
  it('année vierge → 000001', async () => {
    const { prisma } = buildMock()
    expect(await genererNumeroSequentiel(2026, prisma)).toBe('NKONI-2026-000001')
  })

  it('reprend max + 1 pour l’année (isolé par préfixe d’année)', async () => {
    const { prisma, recus } = buildMock()
    recus.set('x', {
      id: 'x', versementId: 'v1', numero: 'NKONI-2026-000004',
      genereParId: 'u', dateGeneration: new Date('2026-01-01'), urlPdf: null,
    })
    // Une autre année ne doit pas influencer 2026.
    recus.set('y', {
      id: 'y', versementId: 'v1', numero: 'NKONI-2025-000099',
      genereParId: 'u', dateGeneration: new Date('2025-01-01'), urlPdf: null,
    })
    expect(await genererNumeroSequentiel(2026, prisma)).toBe('NKONI-2026-000005')
  })
})

/* -------------------------------------------------------------------------- */
/* genererRecu                                                                */
/* -------------------------------------------------------------------------- */

describe('genererRecu (§4.6)', () => {
  const now = new Date('2026-05-01T10:00:00Z')

  it('génère un Recu au format attendu, urlPdf null, dateGeneration = now', async () => {
    const { prisma } = buildMock(['v1'])
    const recu = await genererRecu(prisma, 'v1', 'u-tres', now)

    expect(recu.numero).toBe('NKONI-2026-000001')
    expect(recu.versementId).toBe('v1')
    expect(recu.genereParId).toBe('u-tres')
    expect(recu.urlPdf).toBeNull() // pas de PDF à cette étape
    expect(recu.dateGeneration).toEqual(now)
  })

  it('l’année vient de dateGeneration (now), pas du versement', async () => {
    const { prisma } = buildMock(['v1'])
    const recu = await genererRecu(prisma, 'v1', 'u', new Date('2027-01-02T00:00:00Z'))
    expect(recu.numero).toBe('NKONI-2027-000001')
  })

  it('deux générations la même année → numéros séquentiels distincts (000001, 000002)', async () => {
    const { prisma, recus } = buildMock(['v1', 'v2'])
    const r1 = await genererRecu(prisma, 'v1', 'u', now)
    const r2 = await genererRecu(prisma, 'v2', 'u', now)

    expect(r1.numero).toBe('NKONI-2026-000001')
    expect(r2.numero).toBe('NKONI-2026-000002')
    expect(r1.numero).not.toBe(r2.numero)
    expect(recus.size).toBe(2)
  })

  it('Versement inexistant → VersementIntrouvableError (aucun Recu créé)', async () => {
    const { prisma, recus } = buildMock([]) // aucun versement
    await expect(genererRecu(prisma, 'inconnu', 'u', now)).rejects.toBeInstanceOf(
      VersementIntrouvableError,
    )
    expect(recus.size).toBe(0)
  })

  it('concurrence : sur collision de numéro (P2002), rejoue et prend le suivant', async () => {
    // Mock spécial : la 1re création échoue en P2002 (un « fantôme » concurrent a pris
    // 000001 juste après la lecture du max) ; le retry relit le max et prend 000002.
    const recus = new Map<string, MockRecu>()
    let seq = 0
    let premiereCreation = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      versement: {
        findUnique: async () => ({
          id: 'v1',
          montant: 12000,
          dateVersement: new Date('2026-06-01T00:00:00Z'),
          mode: 'ESPECES',
          contribution: { membreId: 'm1', annee: 2026 },
        }),
      },
      recu: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findFirst: async ({ where }: any) => {
          // Aucun reçu actif sur ce versement : ce test porte sur la collision de NUMÉRO.
          if (where.versementId !== undefined) return null
          const prefixe: string = where.numero.startsWith
          const m = [...recus.values()]
            .filter((r) => r.numero.startsWith(prefixe))
            .sort((a, b) => (a.numero < b.numero ? 1 : -1))
          return m[0] ? { numero: m[0].numero } : null
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: async ({ data }: any) => {
          if (premiereCreation) {
            premiereCreation = false
            // Transaction concurrente : occupe le numéro visé juste avant nous.
            recus.set('phantom', {
              id: 'phantom', versementId: 'vX', numero: data.numero,
              genereParId: 'autre', dateGeneration: now, urlPdf: null,
            })
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
          }
          const rec: MockRecu = { id: `r${++seq}`, urlPdf: null, annuleLe: null, ...data }
          recus.set(rec.id, rec)
          return { ...rec }
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: async (fn: any) => fn(prisma),
    }

    const recu = await genererRecu(prisma as RecuPrisma, 'v1', 'u', now)
    // 1re tentative visait 000001 → collision (fantôme) ; retry → 000002.
    expect(recu.numero).toBe('NKONI-2026-000002')
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ANNULATION COMPTABLE d'un reçu : jamais de suppression physique — le numéro et la trace restent.
 * C'est la seule porte de sortie quand un versement doit être corrigé après émission du reçu.
 */
describe('annulerRecu (annulation comptable)', () => {
  function buildPrisma(recu: { id: string; numero: string; annuleLe: Date | null } | null) {
    const ecritures: any[] = []
    const prisma: any = {
      recu: {
        findUnique: async () => recu,
        update: async ({ data }: any) => {
          ecritures.push(data)
          return { id: recu?.id, numero: recu?.numero, annuleLe: data.annuleLe }
        },
      },
    }
    return { prisma, ecritures }
  }

  const actif = { id: 'r1', numero: 'NKONI-2026-000006', annuleLe: null }

  it('marque le reçu annulé en conservant son numéro, avec auteur et horodatage', async () => {
    const { prisma, ecritures } = buildPrisma(actif)
    const le = new Date('2026-07-19T10:00:00Z')
    const res = await annulerRecu(prisma, 'r1', 'u-tresoriere', 'saisie erronée', le)

    expect(res).toMatchObject({ numero: 'NKONI-2026-000006', annuleLe: le })
    expect(ecritures[0]).toMatchObject({
      annuleLe: le,
      annuleParId: 'u-tresoriere',
      motifAnnulation: 'saisie erronée',
    })
  })

  it('le motif est optionnel (non écrit si absent)', async () => {
    const { prisma, ecritures } = buildPrisma(actif)
    await annulerRecu(prisma, 'r1', 'u-admin')
    expect(ecritures[0]).not.toHaveProperty('motifAnnulation')
  })

  it('refuse une seconde annulation (non rejouable)', async () => {
    const { prisma, ecritures } = buildPrisma({ ...actif, annuleLe: new Date('2026-01-01') })
    await expect(annulerRecu(prisma, 'r1', 'u-admin')).rejects.toBeInstanceOf(RecuDejaAnnuleError)
    expect(ecritures).toHaveLength(0)
  })

  it('lève RecuIntrouvableError si le reçu n’existe pas (ou est hors organisation)', async () => {
    const { prisma } = buildPrisma(null)
    await expect(annulerRecu(prisma, 'inconnu', 'u-admin')).rejects.toBeInstanceOf(
      RecuIntrouvableError,
    )
  })
})


/**
 * UN SEUL reçu ACTIF par versement : deux justificatifs numérotés valides pour un même
 * encaissement seraient une faille comptable. La séquence correcte est ANNULER puis RÉÉMETTRE.
 */
describe('genererRecu — un seul reçu actif par versement', () => {
  it('refuse un second reçu tant que le premier est ACTIF', async () => {
    const { prisma } = buildMock(['v1'])
    const premier = await genererRecu(prisma, 'v1', 'u1')
    await expect(genererRecu(prisma, 'v1', 'u1')).rejects.toBeInstanceOf(RecuActifExistantError)
    // L'erreur porte le numéro en conflit (repris dans le message i18n de la route).
    await expect(genererRecu(prisma, 'v1', 'u1')).rejects.toMatchObject({
      numero: premier.numero,
    })
  })

  it('AUTORISE la réémission une fois le premier reçu annulé, sous un NOUVEAU numéro', async () => {
    const { prisma, recus } = buildMock(['v1'])
    const premier = await genererRecu(prisma, 'v1', 'u1')

    // Annulation (le mock stocke l'état ; le service d'annulation est testé à part).
    const stocke = [...recus.values()].find((r) => r.numero === premier.numero)!
    stocke.annuleLe = new Date('2026-07-19')

    const second = await genererRecu(prisma, 'v1', 'u1')
    expect(second.numero).not.toBe(premier.numero)
  })

  it('n’empêche pas d’émettre le reçu d’un AUTRE versement', async () => {
    const { prisma } = buildMock(['v1', 'v2'])
    await genererRecu(prisma, 'v1', 'u1')
    await expect(genererRecu(prisma, 'v2', 'u1')).resolves.toMatchObject({ versementId: 'v2' })
  })
})
