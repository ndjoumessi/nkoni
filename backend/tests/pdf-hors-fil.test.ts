import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  genererPdfHorsFil,
  executerTachePdf,
  doitSortirDuFil,
  SEUIL_LIGNES_HORS_FIL,
  type TachePdf,
} from '../src/services/pdf-hors-fil.service'
import type { DonneesExport } from '../src/services/export.service'

/**
 * Rendu PDF hors du fil principal (`docs/performance-charge.md` §2.3) : un export PDF d'une grande
 * organisation figeait le serveur pour TOUS les tenants (~0,7 s à 3 000 membres). On vérifie ici la
 * propriété qui compte — le fil principal continue de tourner pendant le rendu — et non le simple
 * fait qu'un worker existe ; puis le repli, et le chemin RÉEL de production (module compilé).
 */
function donnees(lignes: number): DonneesExport {
  return {
    genereLe: new Date('2026-09-19T08:00:00Z'),
    filtres: {},
    lignes: Array.from({ length: lignes }, (_, i) => ({
      membreId: `m${i}`,
      nom: `Nom${i}`,
      prenom: 'Test',
      annee: 2026,
      montantAttendu: 12_000,
      montantVerse: i % 2 ? 12_000 : 4_000,
      montantValorise: i % 2 ? 12_000 : 4_000,
    })),
    totaux: { montantAttendu: lignes * 12_000, montantVerse: 0, montantValorise: 0 },
  }
}

const tache = (lignes: number): TachePdf => ({ type: 'contributions', args: [donnees(lignes), 'FR', 'FCFA'] })
const estPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-'

/** Compte les tours de boucle d'événements (minuteur de 5 ms) pendant l'exécution de `fn`. */
async function toursPendant(fn: () => Promise<unknown>): Promise<number> {
  let tours = 0
  const minuteur = setInterval(() => tours++, 5)
  try {
    await fn()
  } finally {
    clearInterval(minuteur)
  }
  return tours
}

describe('genererPdfHorsFil', () => {
  const GROS = SEUIL_LIGNES_HORS_FIL + 200

  it('seuil : un petit tableau reste sur le fil (plus rapide que le démarrage d’un worker), une planche de cartes part toujours', () => {
    expect(doitSortirDuFil(tache(50))).toBe(false)
    expect(doitSortirDuFil(tache(SEUIL_LIGNES_HORS_FIL))).toBe(true)
    const carte = { id: 'm', nom: 'N', prenom: 'P', branche: null, anneeAdhesion: 2020, qrUrl: 'https://exemple.test' }
    expect(doitSortirDuFil({ type: 'cartes', args: [[carte], 'Asso', 'FR'] })).toBe(false)
    expect(doitSortirDuFil({ type: 'cartes', args: [[carte, carte], 'Asso', 'FR'] })).toBe(true)
  })

  it('rend le PDF dans un worker, sans repli', async () => {
    const replis: string[] = []
    const pdf = await genererPdfHorsFil(tache(GROS), (m) => replis.push(m))
    expect(estPdf(pdf)).toBe(true)
    expect(replis).toEqual([])
  })

  it('le fil principal CONTINUE DE TOURNER pendant un gros rendu (contre-épreuve : sur le fil, il se fige)', async () => {
    // Contre-épreuve d'abord : le même rendu SUR le fil ne laisse passer (quasiment) aucun tour.
    const surLeFil = await toursPendant(() => executerTachePdf(tache(4000)))
    const horsFil = await toursPendant(() => genererPdfHorsFil(tache(4000)))
    expect(surLeFil).toBeLessThan(3)
    expect(horsFil).toBeGreaterThan(10)
  }, 60_000)

  it('repli sur le fil principal si le worker ne peut pas recevoir la tâche', async () => {
    // Une fonction n'est pas clonable : `postMessage` lève, le worker échoue — le rendu doit quand
    // même aboutir (sur le fil), et le repli être journalisé.
    const piegee = tache(GROS)
    ;(piegee.args[0] as unknown as Record<string, unknown>)['nonClonable'] = () => undefined
    const replis: string[] = []
    const pdf = await genererPdfHorsFil(piegee, (m) => replis.push(m))
    expect(estPdf(pdf)).toBe(true)
    expect(replis).toHaveLength(1)
    expect(replis[0]).toContain('contributions')
  })

  it('cartes : les photos (Buffer → Uint8Array au clonage) arrivent INTACTES dans le PDF', async () => {
    // Arrivée en Uint8Array, la photo serait REFUSÉE par PDFKit — et `carte.service` avale cet échec
    // pour dessiner les initiales : aucune erreur, aucun repli, juste une photo perdue. On compare donc
    // le nombre d'images intégrées (QR, photo et leurs masques) au rendu de RÉFÉRENCE sur le fil, et on
    // vérifie que ce nombre distingue bien une carte avec photo d'une carte sans.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    // DEUX cartes : une planche, donc rendue dans le worker (une carte seule resterait sur le fil).
    const carte = { id: 'm1', nom: 'Abena', prenom: 'Aline', branche: null, anneeAdhesion: 2020, qrUrl: 'https://exemple.test/v' }
    const autre = { ...carte, id: 'm2', prenom: 'Brice' }
    const cartes = (photo?: Buffer): TachePdf => ({
      type: 'cartes',
      args: [[photo ? { ...carte, photo } : carte, autre], 'Association fictive', 'FR'],
    })
    const images = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length

    const reference = images(await executerTachePdf(cartes(png)))
    expect(reference).toBeGreaterThan(images(await executerTachePdf(cartes()))) // le compte est discriminant

    const replis: string[] = []
    const pdf = await genererPdfHorsFil(cartes(png), (m) => replis.push(m))
    expect(estPdf(pdf)).toBe(true)
    expect(replis).toEqual([])
    expect(images(pdf)).toBe(reference)
  })
})

/**
 * Chemin de PRODUCTION : `node dist/app.js` charge le worker COMPILÉ (`.js`, sans `tsx`). La CI
 * construit avant de tester, donc ce test y est OBLIGATOIRE ; en local il suppose un `npm run build`
 * récent (sinon il est sauté — la CI, elle, ne le saute jamais).
 */
const DIST = join(__dirname, '..', 'dist', 'services', 'pdf-hors-fil.service.js')
describe.runIf(process.env['CI'] || existsSync(DIST))('module compilé (dist/)', () => {
  it('rend un PDF par le worker compilé, sans repli', async () => {
    expect(existsSync(DIST)).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compile = require(DIST) as typeof import('../src/services/pdf-hors-fil.service')
    const replis: string[] = []
    const gros = tache(SEUIL_LIGNES_HORS_FIL + 200)
    expect(compile.doitSortirDuFil(gros)).toBe(true) // sinon ce test ne passerait pas par le worker
    const pdf = await compile.genererPdfHorsFil(gros, (m) => replis.push(m))
    expect(estPdf(pdf)).toBe(true)
    expect(replis).toEqual([])
  })
})
