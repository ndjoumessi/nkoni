import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Routes Dashboard (§5.8) : sélection de vue par rôle, cloisonnement strict des champs
 * (RESTREINT sans financier, FINANCIER sans structurel), alerte barème, vue perso, 403
 * GUIDE_RELIGIEUX. Prisma mocké.
 *
 * `anneeCourante` est calculée par la route via `new Date()`. Le jeu de données place les
 * barèmes sur des années PASSÉES (Y-2, Y-1), ce qui rend les totaux déterministes ET
 * garantit que l'année courante Y n'a pas de barème → alerte attendue = true.
 */

const Y = new Date().getFullYear()

const baremes = [
  { annee: Y - 2, montantAttendu: 10_000 },
  { annee: Y - 1, montantAttendu: 10_000 },
]

// 3 ACTIFS (A_JOUR / PARTIEL / NON_A_JOUR), 1 INACTIF, 1 DECEDE.
const membres = [
  {
    id: 'm1', statut: 'ACTIF', anneeAdhesion: Y - 2, anneeFinContribution: null,
    compteUtilisateurId: 'u-simple',
    contributions: [
      { annee: Y - 2, montantValorise: 10_000 },
      { annee: Y - 1, montantValorise: 10_000 },
    ],
  }, // A_JOUR
  {
    id: 'm2', statut: 'ACTIF', anneeAdhesion: Y - 2, anneeFinContribution: null,
    compteUtilisateurId: null,
    contributions: [{ annee: Y - 2, montantValorise: 10_000 }],
  }, // PARTIEL (20000 attendu, 10000 valorisé)
  {
    id: 'm3', statut: 'ACTIF', anneeAdhesion: Y - 2, anneeFinContribution: null,
    compteUtilisateurId: null, contributions: [],
  }, // NON_A_JOUR
  {
    id: 'm4', statut: 'INACTIF', anneeAdhesion: Y - 2, anneeFinContribution: Y - 2,
    compteUtilisateurId: null, contributions: [{ annee: Y - 2, montantValorise: 10_000 }],
  },
  {
    id: 'm5', statut: 'DECEDE', anneeAdhesion: Y - 2, anneeFinContribution: Y - 2,
    compteUtilisateurId: null, contributions: [{ annee: Y - 2, montantValorise: 5_000 }],
  },
]

function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    baremeAnnuel: { findMany: async () => baremes },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any = {}) => {
        let res = membres
        if (where?.statut) res = res.filter((m) => m.statut === where.statut)
        return res
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where }: any) => {
        if (where.id) return membres.find((m) => m.id === where.id) ?? null
        if (where.compteUtilisateurId) {
          return membres.find((m) => m.compteUtilisateurId === where.compteUtilisateurId) ?? null
        }
        return null
      },
    },
    brancheFamiliale: { count: async () => 4 },
  }
  return prisma
}

describe('Routes Dashboard (§5.8)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string, sub = `u-${role}`) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })
  const get = (role: string, sub?: string) =>
    app.inject({ method: 'GET', url: '/dashboard', headers: sub ? auth(role, sub) : auth(role) })

  /* --- COMPLET (ADMIN, PRESIDENT) --------------------------------------- */

  it('ADMIN → vue COMPLET (finances + structurel + alerte)', async () => {
    const res = await get('ADMIN')
    expect(res.statusCode).toBe(200)
    const b = res.json()
    expect(b.vue).toBe('COMPLET')
    expect(b.finances).toEqual({
      totalAttenduCumule: 60_000, // 3 actifs × 20000
      totalCollecteCumule: 30_000, // 20000 + 10000 + 0
      tauxRecouvrement: 50,
    })
    expect(b.membresParStatutContribution).toEqual({ A_JOUR: 1, PARTIEL: 1, NON_A_JOUR: 1 })
    expect(b.membresParStatutMembre).toEqual({ ACTIF: 3, INACTIF: 1, DECEDE: 1 })
    expect(b.nombreBranches).toBe(4)
    expect(b.alertes.baremeAnneeCouranteManquant).toBe(true) // année Y sans barème
  })

  it('PRESIDENT → vue COMPLET', async () => {
    const res = await get('PRESIDENT')
    expect(res.json().vue).toBe('COMPLET')
  })

  /* --- FINANCIER (TRESORIERE, COMMISSAIRE) ------------------------------ */

  it('TRESORIERE → vue FINANCIER', async () => {
    const res = await get('TRESORIERE')
    const b = res.json()
    expect(b.vue).toBe('FINANCIER')
    expect(b.finances.tauxRecouvrement).toBe(50)
    expect(b.membresParStatutContribution).toEqual({ A_JOUR: 1, PARTIEL: 1, NON_A_JOUR: 1 })
  })

  it('COMMISSAIRE_COMPTES → FINANCIER, JAMAIS de champ structurel (branches, statut membre)', async () => {
    const res = await get('COMMISSAIRE_COMPTES')
    const b = res.json()
    expect(b.vue).toBe('FINANCIER')
    expect(b).not.toHaveProperty('nombreBranches')
    expect(b).not.toHaveProperty('membresParStatutMembre')
  })

  /* --- RESTREINT (SECRETAIRE) ------------------------------------------- */

  it('SECRETAIRE → RESTREINT, JAMAIS de champ financier (totalCollecte, finances)', async () => {
    const res = await get('SECRETAIRE')
    const b = res.json()
    expect(b.vue).toBe('RESTREINT')
    expect(b.membresParStatutMembre).toEqual({ ACTIF: 3, INACTIF: 1, DECEDE: 1 })
    expect(b.nombreBranches).toBe(4)
    // Aucune donnée financière.
    expect(b).not.toHaveProperty('finances')
    expect(b).not.toHaveProperty('membresParStatutContribution')
    expect(JSON.stringify(b)).not.toMatch(/totalCollecte|tauxRecouvrement/)
  })

  /* --- PERSO (MEMBRE_SIMPLE) -------------------------------------------- */

  it('MEMBRE_SIMPLE → PERSO, uniquement ses propres données', async () => {
    const res = await get('MEMBRE_SIMPLE', 'u-simple') // rattaché à m1 (A_JOUR)
    expect(res.statusCode).toBe(200)
    const b = res.json()
    expect(b.vue).toBe('PERSO')
    expect(b.membreId).toBe('m1')
    expect(b.statut).toBe('A_JOUR')
    expect(b.totalAttenduCumule).toBe(20_000)
    expect(b.totalValoriseCumule).toBe(20_000)
    // Aucun agrégat global ne fuit dans la vue perso.
    expect(b).not.toHaveProperty('finances')
    expect(b).not.toHaveProperty('membresParStatutMembre')
    expect(b).not.toHaveProperty('nombreBranches')
  })

  it('MEMBRE_SIMPLE sans membre rattaché → 404', async () => {
    const res = await get('MEMBRE_SIMPLE', 'u-orphelin')
    expect(res.statusCode).toBe(404)
  })

  /* --- GUIDE_RELIGIEUX -------------------------------------------------- */

  it('GUIDE_RELIGIEUX → 403 (aucune vue définie en MVP)', async () => {
    const res = await get('GUIDE_RELIGIEUX')
    expect(res.statusCode).toBe(403)
  })
})
