import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { analyserMembres, type MembreAvecStatut } from '../src/services/membreStatut.service'

/**
 * Analyse du tableau de bord (§1.3) — `GET /membres/statuts/analyse`.
 *
 * Remplace un calcul NAVIGATEUR sur `/membres/statuts`, plafonné à 1000 membres : au-delà, branches
 * et relances ne portaient que sur les premiers de l'ordre alphabétique. On verrouille donc ici
 * (1) l'ABSENCE de plafond — aucun `take` sur la lecture des membres, et un total de relances qui
 * compte TOUTE l'organisation — et (2) une réponse de taille constante (six relances détaillées).
 */
const ANNEE = new Date().getFullYear()
const baremes = [{ annee: ANNEE, montantAttendu: 10_000 }]

/** 1 800 membres (≈ 1 170 à relancer) : au-delà de l'ancien plafond. Un sur trois soldé, un sur trois partiel, le reste rien. */
const membres = Array.from({ length: 1800 }, (_, i) => ({
  id: `m${i}`,
  nom: `Nom${String(i).padStart(4, '0')}`,
  prenom: 'Test',
  sexe: null,
  statut: i % 50 === 0 ? 'INACTIF' : 'ACTIF',
  telephone: '690000000',
  brancheId: i % 2 ? 'b1' : null,
  branche: i % 2 ? { id: 'b1', nom: 'Nord' } : null,
  anneeAdhesion: ANNEE,
  anneeFinContribution: i % 50 === 0 ? ANNEE : null,
  compteUtilisateurId: i === 7 ? 'u-simple' : null,
  contributions: [{ annee: ANNEE, montantValorise: i % 3 === 0 ? 10_000 : i % 3 === 1 ? 4_000 : 0 }],
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lectures: any[] = []
function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    baremeAnnuel: { findMany: async () => baremes },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async (args: any = {}) => {
        lectures.push(args)
        const w = args.where
        const tous = w?.compteUtilisateurId ? membres.filter((m) => m.compteUtilisateurId === w.compteUtilisateurId) : membres
        return args.take ? tous.slice(0, args.take) : tous
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async ({ where }: any = {}) =>
        where?.compteUtilisateurId ? 1 : membres.length,
    },
  }
  return prisma
}

describe('GET /membres/statuts/analyse', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const get = (role: string, sub = `u-${role}`) =>
    app.inject({
      method: 'GET',
      url: '/membres/statuts/analyse',
      headers: { authorization: `Bearer ${app.jwt.sign({ sub, role })}` },
    })

  it('porte sur TOUTE l’organisation (aucun plafond) et ne détaille que six relances', async () => {
    lectures.length = 0
    const res = await get('ADMIN')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Aucune lecture bornée : c'est le plafond de 1000 qui tronquait l'analyse.
    expect(lectures.length).toBeGreaterThan(0)
    expect(lectures.every((a) => a.take === undefined)).toBe(true)
    // Actifs non soldés : 1800 − 36 inactifs − soldés actifs (i % 3 === 0 et i % 50 !== 0).
    const attendus = membres.filter(
      (m, i) => m.statut === 'ACTIF' && i % 3 !== 0,
    ).length
    expect(attendus).toBeGreaterThan(1000)
    expect(body.relance.total).toBe(attendus)
    expect(body.relance.membres).toHaveLength(6)
    // « Non à jour » d'abord.
    expect(body.relance.membres[0]).toMatchObject({ statutCotisation: 'NON_A_JOUR', manque: 10_000 })
  })

  it('agrège les branches, sans-branche compris (id null), la plus en retard d’abord', async () => {
    const body = (await get('TRESORIERE')).json()
    expect(body.branches.map((b: { id: string | null }) => b.id).sort()).toEqual(['b1', null].sort())
    const taux = body.branches.map((b: { taux: number }) => b.taux)
    expect([...taux].sort((a, b) => a - b)).toEqual(taux)
  })

  it('MEMBRE_SIMPLE : restreint à sa propre fiche', async () => {
    lectures.length = 0
    const res = await get('MEMBRE_SIMPLE', 'u-simple')
    expect(res.statusCode).toBe(200)
    expect(lectures[0].where).toEqual({ compteUtilisateurId: 'u-simple' })
    expect(res.json().relance.total).toBeLessThanOrEqual(1)
  })

  it('sans jeton : 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/membres/statuts/analyse' })
    expect(res.statusCode).toBe(401)
  })
})

describe('analyserMembres (cœur pur)', () => {
  const m = (p: Partial<MembreAvecStatut>): MembreAvecStatut => ({
    id: 'x', nom: 'N', prenom: 'P', sexe: null, statut: 'ACTIF', telephone: null, brancheId: null,
    branche: null, anneeAdhesion: 2020, anneeFinContribution: null, statutCotisation: 'A_JOUR',
    totalAttenduCumule: 0, totalValoriseCumule: 0, ...p,
  })

  it('exclut les inactifs et les membres à jour des relances ; manque jamais négatif', () => {
    const r = analyserMembres([
      m({ id: 'a', statutCotisation: 'PARTIEL', totalAttenduCumule: 10, totalValoriseCumule: 4 }),
      m({ id: 'b', statut: 'INACTIF', statutCotisation: 'NON_A_JOUR', totalAttenduCumule: 10 }),
      m({ id: 'c', statutCotisation: 'A_JOUR', totalAttenduCumule: 10, totalValoriseCumule: 12 }),
      m({ id: 'd', statutCotisation: 'NON_A_JOUR', totalAttenduCumule: 5 }),
    ])
    expect(r.relance.total).toBe(2)
    expect(r.relance.membres.map((x) => x.id)).toEqual(['d', 'a'])
    expect(r.relance.membres[1]!.manque).toBe(6)
  })

  it('écarte une branche sans attendu et plafonne le taux à 100 %', () => {
    const r = analyserMembres([
      m({ branche: { id: 'b1', nom: 'Nord' }, totalAttenduCumule: 10, totalValoriseCumule: 15 }),
      m({ branche: { id: 'b2', nom: 'Sud' }, totalAttenduCumule: 0 }),
    ])
    expect(r.branches).toEqual([{ id: 'b1', nom: 'Nord', attendu: 10, valorise: 15, taux: 100 }])
  })
})
