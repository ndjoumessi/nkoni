import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import {
  peutVoirEntreeAudit,
  listerAuditLog,
  type DemandeurAudit,
} from '../src/services/audit.service'
import type { Role } from '../src/middlewares/permissions'

/* Entrées d'audit d'exemple. */
const CONF_META = { niveauConfidentialite: 'CONFIDENTIEL', auteurId: 'u-a', responsableSuiviId: 'u-r' }
const entries = [
  { id: 'a1', entiteType: 'Membre', entiteId: 'm1', action: 'CREATE', acteurId: 'u-x', donneesAvant: null, donneesApres: { id: 'm1', nom: 'X' }, dateAction: new Date('2026-01-03') },
  { id: 'a2', entiteType: 'Conflit', entiteId: 'c1', action: 'UPDATE', acteurId: 'u-a', donneesAvant: { id: 'c1', ...CONF_META, statut: 'OUVERT' }, donneesApres: { id: 'c1', ...CONF_META, statut: 'EN_COURS' }, dateAction: new Date('2026-01-02') },
  { id: 'a3', entiteType: 'Utilisateur', entiteId: 'u1', action: 'UPDATE', acteurId: 'u-x', donneesAvant: { id: 'u1', role: 'MEMBRE_SIMPLE' }, donneesApres: { id: 'u1', role: 'SECRETAIRE' }, dateAction: new Date('2026-01-01') },
]

function buildAuditMock(rows = entries) {
  const match = (e: any, where: any = {}) => {
    if (where.entiteType && e.entiteType !== where.entiteType) return false
    if (where.entiteId && e.entiteId !== where.entiteId) return false
    if (where.acteurId && e.acteurId !== where.acteurId) return false
    if (where.dateAction?.gte && e.dateAction < where.dateAction.gte) return false
    if (where.dateAction?.lte && e.dateAction > where.dateAction.lte) return false
    return true
  }
  return {
    auditLog: {
      count: async ({ where }: any) => rows.filter((e) => match(e, where)).length,
      findMany: async ({ where, skip = 0, take = 50 }: any) => {
        const list = rows
          .filter((e) => match(e, where))
          .sort((a, b) => +b.dateAction - +a.dateAction)
          .slice(skip, skip + take)
        return list.map((e) => ({
          ...e,
          acteur: e.acteurId ? { id: e.acteurId, email: `${e.acteurId}@nkoni.test`, role: 'ADMIN' } : null,
        }))
      },
    },
  }
}

const ADMIN: DemandeurAudit = { id: 'u-admin', role: 'ADMIN' }

/* ==========================================================================
 * peutVoirEntreeAudit — confidentialité héritée pour les entrées CONFLIT
 * ========================================================================== */
describe('peutVoirEntreeAudit', () => {
  const confEntry = { entiteType: 'Conflit', donneesApres: { ...CONF_META } }

  it('entrée non-Conflit : visible par tous', () => {
    for (const role of ['ADMIN', 'PRESIDENT', 'MEMBRE_SIMPLE', 'GUIDE_RELIGIEUX'] as Role[])
      expect(peutVoirEntreeAudit({ entiteType: 'Membre' }, { id: 'u', role })).toBe(true)
  })
  it('entrée Conflit CONFIDENTIEL : visible auteur / responsable / ADMIN', () => {
    expect(peutVoirEntreeAudit(confEntry, { id: 'u-a', role: 'MEMBRE_SIMPLE' })).toBe(true)
    expect(peutVoirEntreeAudit(confEntry, { id: 'u-r', role: 'SECRETAIRE' })).toBe(true)
    expect(peutVoirEntreeAudit(confEntry, { id: 'u-admin', role: 'ADMIN' })).toBe(true)
  })
  it('entrée Conflit CONFIDENTIEL : INVISIBLE pour PRESIDENT/SECRETAIRE non-parties', () => {
    expect(peutVoirEntreeAudit(confEntry, { id: 'u-z', role: 'PRESIDENT' })).toBe(false)
    expect(peutVoirEntreeAudit(confEntry, { id: 'u-z', role: 'SECRETAIRE' })).toBe(false)
    expect(peutVoirEntreeAudit(confEntry, { id: 'u-z', role: 'MEMBRE_SIMPLE' })).toBe(false)
  })
  it('utilise donneesAvant si donneesApres absent (DELETE)', () => {
    const del = { entiteType: 'Conflit', donneesAvant: { ...CONF_META }, donneesApres: null }
    expect(peutVoirEntreeAudit(del, { id: 'u-a', role: 'MEMBRE_SIMPLE' })).toBe(true)
    expect(peutVoirEntreeAudit(del, { id: 'u-z', role: 'PRESIDENT' })).toBe(false)
  })
  it('métadonnées absentes → réservé ADMIN', () => {
    const vide = { entiteType: 'Conflit', donneesApres: null, donneesAvant: null }
    expect(peutVoirEntreeAudit(vide, { id: 'u', role: 'PRESIDENT' })).toBe(false)
    expect(peutVoirEntreeAudit(vide, { id: 'u', role: 'ADMIN' })).toBe(true)
  })
})

/* ==========================================================================
 * listerAuditLog — filtres, pagination, filtrage confidentialité
 * ========================================================================== */
describe('listerAuditLog', () => {
  it('ADMIN voit toutes les entrées (dont Conflit), triées récentes d’abord', async () => {
    const res = await listerAuditLog(buildAuditMock() as any, {}, ADMIN)
    expect(res.total).toBe(3)
    expect(res.donnees).toHaveLength(3)
    expect(res.donnees[0].id).toBe('a1') // 2026-01-03, plus récente
  })

  it('un lecteur non autorisé ne voit PAS l’entrée du conflit confidentiel', async () => {
    // (En prod la route est ADMIN-only ; ici on teste la logique du service.)
    const res = await listerAuditLog(buildAuditMock() as any, {}, { id: 'u-z', role: 'PRESIDENT' })
    expect(res.donnees.map((e: any) => e.id).sort()).toEqual(['a1', 'a3'])
    expect(res.donnees.some((e: any) => e.entiteType === 'Conflit')).toBe(false)
  })

  it('filtre par entiteType', async () => {
    const res = await listerAuditLog(buildAuditMock() as any, { entiteType: 'Membre' }, ADMIN)
    expect(res.donnees).toHaveLength(1)
    expect(res.donnees[0].entiteType).toBe('Membre')
  })

  it('pagination : limite=1 renvoie 1 entrée mais total complet', async () => {
    const res = await listerAuditLog(buildAuditMock() as any, { limite: 1, page: 1 }, ADMIN)
    expect(res.donnees).toHaveLength(1)
    expect(res.limite).toBe(1)
    expect(res.total).toBe(3)
  })
})

/* ==========================================================================
 * Route GET /audit-log — réservé ADMIN
 * ========================================================================== */
describe('GET /audit-log — routes', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildAuditMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })
  const auth = (role: string, sub = `u-${role}`) => ({ authorization: `Bearer ${app.jwt.sign({ sub, role })}` })

  it('ADMIN → 200 avec pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit-log', headers: auth('ADMIN', 'u-admin') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ page: 1, limite: 50, total: 3 })
    expect(body.donnees).toHaveLength(3)
  })

  it('rôles non-ADMIN → 403', async () => {
    for (const role of ['PRESIDENT', 'SECRETAIRE', 'TRESORIERE', 'COMMISSAIRE_COMPTES', 'MEMBRE_SIMPLE', 'GUIDE_RELIGIEUX']) {
      const res = await app.inject({ method: 'GET', url: '/audit-log', headers: auth(role) })
      expect(res.statusCode, role).toBe(403)
    }
  })

  it('sans authentification → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit-log' })
    expect(res.statusCode).toBe(401)
  })
})
