import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE DE PARITÉ INTER-COUCHES — `frontend/src/lib/forfait.ts` ↔ `backend/src/lib/forfait.ts`.
 *
 * Le front ne peut pas importer le back : rien n'empêchait mécaniquement le miroir de dériver (un
 * quota modifié côté serveur, une jauge fausse côté écran). Ce test lit les DEUX sources EN TEXTE
 * (même parti pris que `roles-parity.test.ts`) et compare les VALEURS (unités évaluées), pas le texte
 * brut : une différence de mise en forme ne casse rien, une différence de valeur casse tout.
 *
 * FRAGILITÉ ASSUMÉE : extraction par regex volontairement étroite. Si la forme de la table change
 * (expression calculée, spread, constante intermédiaire), l'extraction LÈVE ou ne trouve plus les trois
 * forfaits — échec bruyant plutôt que vert vacant. Adapter alors les regex dans le même geste.
 *
 * Env `node` (défaut des *.test.ts) : lecture fichier, aucun rendu.
 */

const ICI = dirname(fileURLToPath(import.meta.url))
const FRONT_TS = resolve(ICI, 'forfait.ts')
// frontend/src/lib → ../../../ = racine du dépôt (couplage à l'arborescence : prix d'un garde inter-couches).
const BACK_TS = resolve(ICI, '../../../backend/src/lib/forfait.ts')

interface Capacites {
  limiteMembres: number | null
  quotaStockageOctets: number
  paiementEnLigne: boolean
}

const UNITES: Record<string, number> = { MO: 1024 * 1024, GO: 1024 * 1024 * 1024 }

function lireForfaits(source: string): string[] {
  const m = source.match(/export const FORFAITS\s*=\s*\[([^\]]*)\]/)
  if (!m) throw new Error('FORFAITS introuvable')
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])
}

/** Les unités doivent être définies à l'identique : sinon `UNITES` ci-dessus mentirait. */
function verifierUnites(source: string): void {
  if (!/^const MO = 1024 \* 1024$/m.test(source)) throw new Error('définition de MO absente ou modifiée')
  if (!/^const GO = 1024 \* MO$/m.test(source)) throw new Error('définition de GO absente ou modifiée')
}

function lireCapacites(source: string): Record<string, Capacites> {
  const bloc = source.match(/export const CAPACITES_FORFAIT[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!bloc) throw new Error('CAPACITES_FORFAIT introuvable')
  const ligne =
    /([A-Z_]+):\s*\{\s*limiteMembres:\s*(null|\d+),\s*quotaStockageOctets:\s*(\d+)\s*\*\s*(MO|GO),\s*paiementEnLigne:\s*(true|false)\s*,?\s*\}/g
  const capacites: Record<string, Capacites> = {}
  for (const m of bloc[1].matchAll(ligne)) {
    capacites[m[1]] = {
      limiteMembres: m[2] === 'null' ? null : Number(m[2]),
      quotaStockageOctets: Number(m[3]) * UNITES[m[4]],
      paiementEnLigne: m[5] === 'true',
    }
  }
  return capacites
}

describe('parité inter-couches : forfait.ts front ↔ back', () => {
  const back = readFileSync(BACK_TS, 'utf8')
  const front = readFileSync(FRONT_TS, 'utf8')

  it('même liste de forfaits', () => {
    const forfaits = lireForfaits(back)
    expect(forfaits.length).toBeGreaterThan(0) // anti-vacant
    expect(lireForfaits(front)).toEqual(forfaits)
  })

  it('mêmes unités de stockage des deux côtés', () => {
    expect(() => verifierUnites(back)).not.toThrow()
    expect(() => verifierUnites(front)).not.toThrow()
  })

  it('mêmes capacités, forfait par forfait', () => {
    const capacitesBack = lireCapacites(back)
    // Anti-vacant : TOUS les forfaits extraits, sinon une ligne mal formée passerait inaperçue.
    expect(Object.keys(capacitesBack).sort()).toEqual([...lireForfaits(back)].sort())
    expect(lireCapacites(front)).toEqual(capacitesBack)
  })
})
