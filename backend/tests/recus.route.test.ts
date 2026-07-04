import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes Reçu (§4.6) : génération à la demande, permissions (§2, ligne « Reçu »),
 * périmètre MEMBRE_SIMPLE, lecture filtrée. Prisma mocké stateful.
 */

const anneeCourante = new Date().getFullYear()
const num = (seq: number) => `NKONI-${anneeCourante}-${String(seq).padStart(6, '0')}`

interface VersementInfo {
  id: string
  membreId: string
  compte: string // compteUtilisateurId du membre propriétaire
}

function buildMock() {
  // v1 appartient au membre m1 (compte u-simple), v2 au membre m2 (compte u-autre).
  const versementsInfo: Record<string, VersementInfo> = {
    v1: { id: 'v1', membreId: 'm1', compte: 'u-simple' },
    v2: { id: 'v2', membreId: 'm2', compte: 'u-autre' },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recus = new Map<string, any>()
  let seq = 0

  const shapeVersement = (v: VersementInfo) => ({
    id: v.id,
    contribution: { membreId: v.membreId, membre: { compteUtilisateurId: v.compte } },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    versement: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => {
        const v = versementsInfo[where.id]
        return v ? shapeVersement(v) : null
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) => {
        let res = Object.values(versementsInfo)
        const c = where?.contribution
        if (c?.membreId) res = res.filter((v) => v.membreId === c.membreId)
        const compte = c?.membre?.compteUtilisateurId
        if (compte) res = res.filter((v) => v.compte === compte)
        if (where?.id) res = res.filter((v) => v.id === where.id)
        return res.map((v) => ({ id: v.id }))
      },
    },
    recu: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async ({ where }: any) => {
        const prefixe: string = where.numero.startsWith
        const m = [...recus.values()]
          .filter((r) => r.numero.startsWith(prefixe))
          .sort((a, b) => (a.numero < b.numero ? 1 : -1))
        return m[0] ? { numero: m[0].numero } : null
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        for (const r of recus.values()) {
          if (r.numero === data.numero) {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
          }
        }
        const rec = { id: `r${++seq}`, urlPdf: null, ...data }
        recus.set(rec.id, rec)
        return { ...rec }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) => {
        let res = [...recus.values()]
        if (where?.versementId?.in) {
          const ids: string[] = where.versementId.in
          res = res.filter((r) => ids.includes(r.versementId))
        } else if (where?.versementId) {
          res = res.filter((r) => r.versementId === where.versementId)
        }
        return res
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: any) => fn(prisma),
  }

  return { prisma, recus }
}

describe('Routes Reçu (§4.6)', () => {
  let app: FastifyInstance
  let store: ReturnType<typeof buildMock>

  beforeEach(async () => {
    store = buildMock()
    app = await buildApp({ prisma: store.prisma, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })
  const genererPour = (versementId: string, role: string, sub?: string) =>
    app.inject({
      method: 'POST',
      url: `/versements/${versementId}/recu`,
      headers: sub ? auth(role, sub) : auth(role),
    })

  /* --- Génération -------------------------------------------------------- */

  it('TRESORIERE : génère un reçu au format attendu (201)', async () => {
    const res = await genererPour('v1', 'TRESORIERE')
    expect(res.statusCode).toBe(201)
    const recu = res.json()
    expect(recu.numero).toBe(num(1))
    expect(recu.versementId).toBe('v1')
    expect(recu.urlPdf).toBeNull()
  })

  it('deux générations la même année → séquentiels distincts (000001, 000002)', async () => {
    const r1 = await genererPour('v1', 'ADMIN')
    const r2 = await genererPour('v2', 'ADMIN')
    expect(r1.json().numero).toBe(num(1))
    expect(r2.json().numero).toBe(num(2))
  })

  it('Versement inexistant → 404', async () => {
    const res = await genererPour('inconnu', 'TRESORIERE')
    expect(res.statusCode).toBe(404)
  })

  /* --- Permissions ------------------------------------------------------- */

  it('SECRETAIRE : génération refusée (403)', async () => {
    const res = await genererPour('v1', 'SECRETAIRE')
    expect(res.statusCode).toBe(403)
  })

  it('MEMBRE_SIMPLE : génère le reçu de SON propre versement (201)', async () => {
    // u-simple possède v1.
    const res = await genererPour('v1', 'MEMBRE_SIMPLE', 'u-simple')
    expect(res.statusCode).toBe(201)
    expect(res.json().numero).toBe(num(1))
  })

  it('MEMBRE_SIMPLE : refusé sur le versement d’un autre (403)', async () => {
    // u-simple tente v2 (appartient à u-autre).
    const res = await genererPour('v2', 'MEMBRE_SIMPLE', 'u-simple')
    expect(res.statusCode).toBe(403)
    expect(store.recus.size).toBe(0) // rien créé
  })

  /* --- Lecture ----------------------------------------------------------- */

  it('GET /recus?membreId= : lecture par membre (ADMIN)', async () => {
    await genererPour('v1', 'ADMIN') // reçu du membre m1
    await genererPour('v2', 'ADMIN') // reçu du membre m2
    const res = await app.inject({
      method: 'GET',
      url: '/recus?membreId=m1',
      headers: auth('ADMIN'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].versementId).toBe('v1')
  })

  it('GET /recus : MEMBRE_SIMPLE ne voit que les reçus de ses versements', async () => {
    await genererPour('v1', 'ADMIN') // m1 (u-simple)
    await genererPour('v2', 'ADMIN') // m2 (u-autre)
    const res = await app.inject({
      method: 'GET',
      url: '/recus',
      headers: auth('MEMBRE_SIMPLE', 'u-simple'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].versementId).toBe('v1')
  })

  it('SECRETAIRE : lecture refusée (403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/recus',
      headers: auth('SECRETAIRE'),
    })
    expect(res.statusCode).toBe(403)
  })
})

/* -------------------------------------------------------------------------- */
/* Garantie : AUCUNE génération automatique de Recu ailleurs (§4.6 règle 1)   */
/* -------------------------------------------------------------------------- */

describe('Aucune génération automatique de Recu (§4.6, non négociable)', () => {
  const lire = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

  it('versements.route.ts ne crée jamais de Recu', () => {
    const src = lire('src/routes/versements.route.ts')
    expect(src).not.toMatch(/recu/i)
  })

  it('contribution.service.ts ne crée jamais de Recu', () => {
    const src = lire('src/services/contribution.service.ts')
    expect(src).not.toMatch(/recu/i)
  })
})
