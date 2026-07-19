import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * GET /recus/:id/pdf + POST /recus/:id/whatsapp — contrôle d'accès + isolation (le membre ne voit
 * que SES reçus) + Blob privé (lecture via app.blob) + WhatsApp best-effort (client mocké).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildMock(membreCompteId: string | null, annuleLe: Date | null = null) {
  const prisma: any = {
    recu: {
      findUnique: async ({ where }: any) =>
        where.id === 'r1'
          ? { id: 'r1', numero: 'NKONI-2024-000001', dateGeneration: new Date('2024-03-01'), versementId: 'v1', urlPdf: null, annuleLe }
          : null,
      update: async () => ({}),
    },
    versement: {
      findUnique: async () => ({
        montant: 10_000,
        mode: 'ESPECES',
        contribution: { annee: 2024, membre: { nom: 'T', prenom: 'B', compteUtilisateurId: membreCompteId, telephone: '690000000' } },
      }),
    },
    utilisateur: {
      findUnique: async () => ({ langue: 'FR', organisation: { langueDefaut: 'FR', devise: 'FCFA' }, notificationsActives: null }),
    },
  }
  const blob: any = { put: async () => ({ url: 'https://blob.test/r' }), lireContenu: async () => null, del: async () => {} }
  const whatsapp = { disponible: () => true, envoyerDocument: vi.fn(async () => ({ ok: true })) }
  return { prisma, blob, whatsapp }
}

describe('Reçu PDF + WhatsApp — accès', () => {
  let app: FastifyInstance
  let whatsapp: { disponible: () => boolean; envoyerDocument: ReturnType<typeof vi.fn> }
  const auth = (role: string, sub: string) => ({ authorization: `Bearer ${app.jwt.sign({ sub, role })}` })

  async function demarrer(membreCompteId: string | null, annuleLe: Date | null = null) {
    const m = buildMock(membreCompteId, annuleLe)
    whatsapp = m.whatsapp
    app = await buildApp({ prisma: m.prisma as any, blob: m.blob as any, whatsapp: m.whatsapp as any, logger: false })
    await app.ready()
  }
  afterEach(async () => app?.close())

  it('gestion (ADMIN) → 200 + PDF (%PDF)', async () => {
    await demarrer('u1')
    const res = await app.inject({ method: 'GET', url: '/recus/r1/pdf', headers: auth('ADMIN', 'admin') })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('MEMBRE_SIMPLE propriétaire → 200', async () => {
    await demarrer('u1')
    const res = await app.inject({ method: 'GET', url: '/recus/r1/pdf', headers: auth('MEMBRE_SIMPLE', 'u1') })
    expect(res.statusCode).toBe(200)
  })

  it('MEMBRE_SIMPLE NON propriétaire → 404 (pas de fuite d’existence)', async () => {
    await demarrer('u1')
    const res = await app.inject({ method: 'GET', url: '/recus/r1/pdf', headers: auth('MEMBRE_SIMPLE', 'autre') })
    expect(res.statusCode).toBe(404)
  })

  it('reçu inexistant → 404', async () => {
    await demarrer('u1')
    const res = await app.inject({ method: 'GET', url: '/recus/inconnu/pdf', headers: auth('ADMIN', 'admin') })
    expect(res.statusCode).toBe(404)
  })

  it('POST /recus/:id/whatsapp (ADMIN) → 200 { envoye:true }, document transmis', async () => {
    await demarrer('u1')
    const res = await app.inject({ method: 'POST', url: '/recus/r1/whatsapp', headers: auth('ADMIN', 'admin') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ envoye: true })
    expect(whatsapp.envoyerDocument).toHaveBeenCalled()
  })

  /**
   * Un reçu ANNULÉ ne doit plus circuler : ni téléchargement authentifié, ni (re)poussée WhatsApp.
   * Sans ces gardes, l'annulation comptable ne serait qu'un changement d'étiquette en base — le
   * PDF corrigé resterait servi à l'identique (il est de surcroît mis en cache sur Blob).
   */
  describe('reçu ANNULÉ', () => {
    const annule = new Date('2026-07-19T10:00:00Z')

    it('GET /recus/:id/pdf → 409 (l’appelant authentifié a droit de savoir qu’il est annulé)', async () => {
      await demarrer('u1', annule)
      const res = await app.inject({ method: 'GET', url: '/recus/r1/pdf', headers: auth('ADMIN', 'admin') })
      expect(res.statusCode).toBe(409)
      expect(res.headers['content-type']).not.toContain('application/pdf')
    })

    it('MEMBRE_SIMPLE propriétaire ne peut plus télécharger son reçu annulé', async () => {
      await demarrer('u1', annule)
      const res = await app.inject({ method: 'GET', url: '/recus/r1/pdf', headers: auth('MEMBRE_SIMPLE', 'u1') })
      expect(res.statusCode).toBe(409)
    })

    it('POST /recus/:id/whatsapp → 409 et AUCUN document transmis', async () => {
      await demarrer('u1', annule)
      const res = await app.inject({ method: 'POST', url: '/recus/r1/whatsapp', headers: auth('ADMIN', 'admin') })
      expect(res.statusCode).toBe(409)
      expect(whatsapp.envoyerDocument).not.toHaveBeenCalled()
    })
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
