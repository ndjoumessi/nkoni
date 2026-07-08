import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { assemblerDonneesContributions } from '../src/services/export.service'

/**
 * Routes Rapports financiers : permissions (mêmes rôles que le module financier via
 * l'entité `Export`), forme des réponses, et validation de la plage. Prisma mocké.
 */

const baremes = [
  { annee: 2024, montantAttendu: 10_000 },
  { annee: 2025, montantAttendu: 12_000 },
]

const membres = [
  {
    anneeAdhesion: 2024,
    anneeFinContribution: null,
    contributions: [
      { annee: 2024, montantValorise: 10_000 },
      { annee: 2025, montantValorise: 6_000 },
    ],
  },
  {
    anneeAdhesion: 2024,
    anneeFinContribution: null,
    contributions: [{ annee: 2024, montantValorise: 10_000 }],
  },
]

// Contributions (source du détail par membre ET des exports PDF/Excel) : 3 membres en 2025
// couvrant les 3 statuts, + 1 ligne 2024 pour vérifier le filtre par année.
const contributions = [
  { membreId: 'mB', annee: 2025, montantAttendu: 10_000, montantVerse: 4_000, montantValorise: 4_000, membre: { nom: 'Bravo', prenom: 'B' } },
  { membreId: 'mA', annee: 2025, montantAttendu: 10_000, montantVerse: 10_000, montantValorise: 10_000, membre: { nom: 'Alpha', prenom: 'A' } },
  { membreId: 'mC', annee: 2025, montantAttendu: 10_000, montantVerse: 0, montantValorise: 0, membre: { nom: 'Charlie', prenom: 'C' } },
  { membreId: 'mA', annee: 2024, montantAttendu: 8_000, montantVerse: 8_000, montantValorise: 8_000, membre: { nom: 'Alpha', prenom: 'A' } },
]

function buildMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    baremeAnnuel: { findMany: async () => baremes },
    membre: { findMany: async () => membres },
    // Respecte `where.annee` (comme la vraie DB) pour que le filtre par année soit testable.
    contribution: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) =>
        contributions.filter((c) => where?.annee === undefined || c.annee === where.annee),
    },
  }
  return prisma
}

describe('Routes Rapports financiers', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildMock() as any, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const auth = (role: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: `u-${role}`, role })}`,
  })
  const financier = (role: string, qs = '?anneeDebut=2024&anneeFin=2025') =>
    app.inject({ method: 'GET', url: `/rapports/financier${qs}`, headers: auth(role) })
  const comparaison = (role: string, qs = '?anneeA=2024&anneeB=2025') =>
    app.inject({ method: 'GET', url: `/rapports/comparaison${qs}`, headers: auth(role) })

  /* --- Contenu ---------------------------------------------------------- */

  it('ADMIN : rapport financier multi-années (200, une entrée par année)', async () => {
    const res = await financier('ADMIN')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.anneeDebut).toBe(2024)
    expect(body.anneeFin).toBe(2025)
    expect(body.annees.map((a: { annee: number }) => a.annee)).toEqual([2024, 2025])
    // 2024 : attendu 20000 (10000 × 2), collecté 20000, taux 100.
    const a2024 = body.annees[0]
    expect(a2024.totalAttendu).toBe(20_000)
    expect(a2024.totalCollecte).toBe(20_000)
    expect(a2024.tauxRecouvrement).toBe(100)
  })

  it('TRESORIERE : comparaison de deux années (200, variations présentes)', async () => {
    const res = await comparaison('TRESORIERE')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.anneeA).toBe(2024)
    expect(body.anneeB).toBe(2025)
    expect(body.rapportA).not.toBeNull()
    expect(body.rapportB).not.toBeNull()
    expect(body.variations).toHaveProperty('tauxRecouvrement')
  })

  it('plage invalide (anneeDebut > anneeFin) → 400', async () => {
    const res = await financier('ADMIN', '?anneeDebut=2025&anneeFin=2024')
    expect(res.statusCode).toBe(400)
  })

  it('paramètre manquant → 400 (schéma)', async () => {
    const res = await financier('ADMIN', '?anneeDebut=2024')
    expect(res.statusCode).toBe(400)
  })

  /* --- Permissions (financier) ------------------------------------------ */

  it('PRESIDENT : autorisé (200)', async () => {
    expect((await financier('PRESIDENT')).statusCode).toBe(200)
  })

  it('COMMISSAIRE_COMPTES : autorisé (200)', async () => {
    expect((await financier('COMMISSAIRE_COMPTES')).statusCode).toBe(200)
  })

  it('SECRETAIRE : refusé (403)', async () => {
    expect((await financier('SECRETAIRE')).statusCode).toBe(403)
  })

  it('MEMBRE_SIMPLE : refusé (403)', async () => {
    expect((await financier('MEMBRE_SIMPLE')).statusCode).toBe(403)
  })

  it('GUIDE_RELIGIEUX : refusé (403)', async () => {
    expect((await financier('GUIDE_RELIGIEUX')).statusCode).toBe(403)
  })

  /* --- Permissions (comparaison) : même garde ---------------------------- */

  it('comparaison — SECRETAIRE refusé (403), COMMISSAIRE autorisé (200)', async () => {
    expect((await comparaison('SECRETAIRE')).statusCode).toBe(403)
    expect((await comparaison('COMMISSAIRE_COMPTES')).statusCode).toBe(200)
  })

  /* --- Exports PDF / Excel ---------------------------------------------- */

  const exportFinancier = (role: string, qs: string) =>
    app.inject({ method: 'GET', url: `/rapports/financier/export${qs}`, headers: auth(role) })
  const exportComparaison = (role: string, qs: string) =>
    app.inject({ method: 'GET', url: `/rapports/comparaison/export${qs}`, headers: auth(role) })

  it('export financier Excel par défaut (200, xlsx, signature PK, nom avec plage)', async () => {
    const res = await exportFinancier('ADMIN', '?anneeDebut=2024&anneeFin=2025')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet')
    expect(res.headers['content-disposition']).toContain('rapport-financier-2024-2025.xlsx')
    expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('export financier PDF (200, pdf, signature %PDF)', async () => {
    const res = await exportFinancier('TRESORIERE', '?anneeDebut=2024&anneeFin=2025&format=pdf')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('rapport-financier-2024-2025.pdf')
    expect(res.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('export comparaison Excel (200, nom avec les deux années)', async () => {
    const res = await exportComparaison('COMMISSAIRE_COMPTES', '?anneeA=2024&anneeB=2025')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('comparaison-2024-2025.xlsx')
    expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('export comparaison PDF (200, %PDF)', async () => {
    const res = await exportComparaison('ADMIN', '?anneeA=2024&anneeB=2025&format=pdf')
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('export financier : plage invalide → 400', async () => {
    const res = await exportFinancier('ADMIN', '?anneeDebut=2025&anneeFin=2024')
    expect(res.statusCode).toBe(400)
  })

  it('export : SECRETAIRE et MEMBRE_SIMPLE refusés (403)', async () => {
    expect((await exportFinancier('SECRETAIRE', '?anneeDebut=2024&anneeFin=2025')).statusCode).toBe(403)
    expect((await exportComparaison('MEMBRE_SIMPLE', '?anneeA=2024&anneeB=2025')).statusCode).toBe(403)
  })

  /* --- Comparaison multi-années (annees=) + rétrocompatibilité ---------- */

  it('comparaison multi (annees=2024,2025) : 200, chaîne de variations', async () => {
    const res = await comparaison('ADMIN', '?annees=2024,2025')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.annees.map((a: { annee: number }) => a.annee)).toEqual([2024, 2025])
    expect(body.annees[0].variations).toBeNull() // 1re année
    // 2025 vs 2024 : attendu 20000 → 24000 = +20.
    expect(body.annees[1].variations.totalAttendu).toBe(20)
  })

  it('rétrocompatibilité : anciens paramètres anneeA/anneeB toujours acceptés (200, ancien format)', async () => {
    const res = await comparaison('ADMIN', '?anneeA=2024&anneeB=2025')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('rapportA') // forme paire, pas multi
    expect(body).toHaveProperty('variations')
  })

  it('comparaison sans paramètre valide → 400', async () => {
    expect((await comparaison('ADMIN', '')).statusCode).toBe(400)
    // Une seule année ne respecte pas le motif (≥ 2 années) → 400 (schéma).
    expect((await comparaison('ADMIN', '?annees=2024')).statusCode).toBe(400)
  })

  it('export comparaison multi (annees=) : 200, nom de fichier avec toutes les années', async () => {
    const res = await exportComparaison('TRESORIERE', '?annees=2024,2025&format=xlsx')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('comparaison-2024-2025.xlsx')
    expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('export comparaison multi PDF : 200, %PDF', async () => {
    const res = await exportComparaison('ADMIN', '?annees=2024,2025&format=pdf')
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  /* --- Détail par membre (JSON) ----------------------------------------- */

  const detail = (role: string, qs = '?annee=2025') =>
    app.inject({ method: 'GET', url: `/rapports/detail-membres${qs}`, headers: auth(role) })

  it('ADMIN : détail par membre (200, lignes triées, statuts et totaux corrects)', async () => {
    const res = await detail('ADMIN')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.annee).toBe(2025)
    // Triées par nom : Alpha, Bravo, Charlie.
    expect(body.lignes.map((l: { nom: string }) => l.nom)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    // Statuts dérivés (valorisé vs attendu, mono-année) : 10000=10000 → À jour ; 4000<10000 →
    // partiel ; 0 → non à jour.
    expect(body.lignes.map((l: { statut: string }) => l.statut)).toEqual([
      'A_JOUR',
      'PARTIEL',
      'NON_A_JOUR',
    ])
    expect(body.totaux).toEqual({ montantAttendu: 30_000, montantVerse: 14_000, montantValorise: 14_000 })
    // Chaque ligne porte bien versé ET valorisé (colonnes de l'écran).
    expect(body.lignes[1]).toMatchObject({ montantVerse: 4_000, montantValorise: 4_000 })
  })

  it('même source que l’export : les lignes correspondent à assemblerDonneesContributions', async () => {
    const res = await detail('ADMIN')
    const attendu = await assemblerDonneesContributions(buildMock(), { annee: 2025 })
    const body = res.json()
    // Mêmes membres, mêmes montants, même ordre que l'assemblage utilisé par l'export PDF/Excel.
    expect(body.lignes.map((l: { membreId: string }) => l.membreId)).toEqual(
      attendu.lignes.map((l) => l.membreId),
    )
    body.lignes.forEach((l: { montantAttendu: number; montantVerse: number; montantValorise: number }, i: number) => {
      expect(l.montantAttendu).toBe(attendu.lignes[i].montantAttendu)
      expect(l.montantVerse).toBe(attendu.lignes[i].montantVerse)
      expect(l.montantValorise).toBe(attendu.lignes[i].montantValorise)
    })
    expect(body.totaux).toEqual(attendu.totaux)
  })

  it('filtre par année : annee=2024 ne renvoie que les contributions 2024', async () => {
    const res = await detail('ADMIN', '?annee=2024')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.annee).toBe(2024)
    expect(body.lignes).toHaveLength(1)
    expect(body.lignes[0]).toMatchObject({ nom: 'Alpha', montantVerse: 8_000, statut: 'A_JOUR' })
  })

  it('année manquante → 400 (schéma)', async () => {
    expect((await detail('ADMIN', '')).statusCode).toBe(400)
  })

  it('permissions : mêmes rôles que les autres endpoints Rapports', async () => {
    expect((await detail('PRESIDENT')).statusCode).toBe(200)
    expect((await detail('TRESORIERE')).statusCode).toBe(200)
    expect((await detail('COMMISSAIRE_COMPTES')).statusCode).toBe(200)
    expect((await detail('SECRETAIRE')).statusCode).toBe(403)
    expect((await detail('MEMBRE_SIMPLE')).statusCode).toBe(403)
    expect((await detail('GUIDE_RELIGIEUX')).statusCode).toBe(403)
  })
})
