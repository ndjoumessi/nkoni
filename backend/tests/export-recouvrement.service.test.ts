import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  assemblerDonneesRecouvrement,
  genererRecouvrementExcel,
  type DonneesRecouvrement,
  type LigneRecouvrement,
} from '../src/services/export-recouvrement.service'
import type { MembreStatutPrisma } from '../src/services/membreStatut.service'

/**
 * Tests unitaires de l'assemblage du rapport de RECOUVREMENT (membres actifs avec reste dû cumulé).
 * Prisma mocké (comme membreStatut.service.test) : barèmes + membres, aucun N+1.
 *
 * On vérifie les trois invariants du rapport : (1) seuls les membres ACTIFS sont considérés — le
 * filtre passe par le `where` de `calculerStatutsMembres`, le mock l'honore ; (2) seuls ceux dont
 * le reste dû est > 0 sont inclus (les A jour sortent) ; (3) le reste dû est borné à 0 (un trop-versé
 * n'affiche pas de négatif) et les totaux somment les lignes retenues.
 */

const baremes = [
  { annee: 2024, montantAttendu: 10_000 },
  { annee: 2025, montantAttendu: 10_000 },
]

// Fenêtre 2024..2025 → attendu cumulé 20 000 pour un adhérent 2024.
const membres = [
  {
    id: 'm1', nom: 'Aa', prenom: 'A', sexe: 'M', statut: 'ACTIF', telephone: '600',
    brancheId: 'b1', branche: { id: 'b1', nom: 'Nord' }, anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [{ annee: 2024, montantValorise: 10_000 }, { annee: 2025, montantValorise: 10_000 }],
  }, // 20000/20000 → A_JOUR, reste 0 → EXCLU
  {
    id: 'm2', nom: 'Bb', prenom: 'B', sexe: 'F', statut: 'ACTIF', telephone: '699000000',
    brancheId: 'b1', branche: { id: 'b1', nom: 'Nord' }, anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [{ annee: 2024, montantValorise: 5_000 }],
  }, // 20000/5000 → PARTIEL, reste 15000 → INCLUS
  {
    id: 'm3', nom: 'Cc', prenom: 'C', sexe: null, statut: 'ACTIF', telephone: null,
    brancheId: null, branche: null, anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [],
  }, // 20000/0 → NON_A_JOUR, reste 20000 → INCLUS
  {
    id: 'm4', nom: 'Dd', prenom: 'D', sexe: 'M', statut: 'INACTIF', telephone: '677',
    brancheId: null, branche: null, anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [],
  }, // devrait 20000 mais INACTIF → EXCLU par le where.statut
  {
    id: 'm5', nom: 'Ee', prenom: 'E', sexe: 'F', statut: 'ACTIF', telephone: '688',
    brancheId: null, branche: null, anneeAdhesion: 2024, anneeFinContribution: null,
    contributions: [{ annee: 2024, montantValorise: 10_000 }, { annee: 2025, montantValorise: 15_000 }],
  }, // 20000/25000 (trop-versé) → A_JOUR, reste borné à 0 → EXCLU (teste le clamp)
]

function buildMock(capture?: { where?: unknown }): MembreStatutPrisma {
  return {
    baremeAnnuel: { findMany: async () => baremes },
    membre: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any = {}) => {
        if (capture) capture.where = where
        // Le vrai Prisma applique le where ; le mock l'honore pour le statut (sinon m4 passerait).
        return where?.statut ? membres.filter((m) => m.statut === where.statut) : membres
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      count: async ({ where }: any = {}) =>
        where?.statut ? membres.filter((m) => m.statut === where.statut).length : membres.length,
    },
  }
}

describe('assemblerDonneesRecouvrement', () => {
  it('ne garde que les membres ACTIFS avec un reste dû > 0, triés, avec totaux', async () => {
    const capture: { where?: unknown } = {}
    const d = await assemblerDonneesRecouvrement(buildMock(capture), 2025, new Date('2025-06-01'))

    // (1) le filtre ACTIF est bien passé à calculerStatutsMembres.
    expect(capture.where).toEqual({ statut: 'ACTIF' })

    // (2) seuls m2 (partiel) et m3 (non à jour) restent : m1 & m5 sont à jour, m4 est inactif.
    // Ordre = reste dû DÉCROISSANT → m3 (20 000) avant m2 (15 000).
    expect(d.lignes.map((l) => l.membreId)).toEqual(['m3', 'm2'])
    expect(d.lignes.length).toBeGreaterThan(0) // anti-vacant

    // reste dû + infos de relance portées (le plus gros débiteur en tête).
    expect(d.lignes[0]).toMatchObject({
      membreId: 'm3', statut: 'NON_A_JOUR', telephone: null, branche: null,
      attendu: 20_000, valorise: 0, resteDu: 20_000,
    })
    expect(d.lignes[1]).toMatchObject({
      membreId: 'm2', statut: 'PARTIEL', telephone: '699000000', branche: 'Nord', resteDu: 15_000,
    })

    // (3) aucun reste négatif (clamp sur le trop-versé m5, exclu), et totaux = somme des lignes.
    expect(d.lignes.every((l) => l.resteDu > 0)).toBe(true)
    expect(d.totalResteDu).toBe(35_000)
    expect(d.totalAttendu).toBe(40_000)
    expect(d.totalValorise).toBe(5_000)
    expect(d.anneeCourante).toBe(2025)
    expect(d.genereLe).toEqual(new Date('2025-06-01'))
  })

  it('renvoie une liste vide et des totaux nuls quand tout le monde est à jour', async () => {
    const tousAJour: MembreStatutPrisma = {
      baremeAnnuel: { findMany: async () => baremes },
      membre: {
        findMany: async () => [membres[0]], // m1, A_JOUR
        count: async () => 1,
      },
    }
    const d = await assemblerDonneesRecouvrement(tousAJour, 2025)
    expect(d.lignes).toEqual([])
    expect(d.totalResteDu).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* Colonnes adaptatives Excel (Téléphone/Branche omises si toute la liste vide) */
/* -------------------------------------------------------------------------- */

function ligne(over: Partial<LigneRecouvrement>): LigneRecouvrement {
  return {
    membreId: 'x', nom: 'A', prenom: 'B', telephone: null, branche: null,
    anneeAdhesion: 2024, statut: 'NON_A_JOUR', attendu: 1_000, valorise: 0, resteDu: 1_000, ...over,
  }
}
function donnees(lignes: LigneRecouvrement[]): DonneesRecouvrement {
  return { genereLe: new Date('2026-01-01'), anneeCourante: 2026, lignes, totalAttendu: 0, totalValorise: 0, totalResteDu: 0 }
}
async function entetesExcel(d: DonneesRecouvrement): Promise<string[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await genererRecouvrementExcel(d))
  const row = wb.getWorksheet('Recouvrement')!.getRow(1)
  return (row.values as unknown[]).filter((v): v is string => typeof v === 'string')
}

describe('genererRecouvrementExcel — colonnes adaptatives', () => {
  it('omet Téléphone ET Branche quand aucune ligne n’en porte', async () => {
    const headers = await entetesExcel(donnees([ligne({}), ligne({ membreId: 'y' })]))
    expect(headers).toContain('Nom')
    expect(headers).toContain('Reste dû')
    expect(headers).not.toContain('Téléphone')
    expect(headers).not.toContain('Branche')
  })

  it('affiche Téléphone/Branche dès qu’une seule ligne les renseigne', async () => {
    const headers = await entetesExcel(
      donnees([ligne({}), ligne({ membreId: 'y', telephone: '699000000', branche: 'Nord' })]),
    )
    expect(headers).toContain('Téléphone')
    expect(headers).toContain('Branche')
  })
})
