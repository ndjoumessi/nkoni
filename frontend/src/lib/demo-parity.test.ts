import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ECRITURES_AUTORISEES_EN_DEMO, estRequeteAutoriseeEnDemo } from './demo'

/**
 * GARDE INTER-COUCHES (front ↔ back), même parti pris que `roles-parity.test.ts` : le front ne peut
 * pas importer le back, on lit la source serveur EN TEXTE. Si le serveur ajoute une exception de
 * lecture seule sans que le front la miroite, le client refuserait localement une requête que le
 * serveur accepte (et inversement, un front plus large enverrait des écritures refusées en 403).
 */
const ICI = dirname(fileURLToPath(import.meta.url))
const DEMO_SERVEUR = resolve(ICI, '../../../backend/src/lib/demo.ts')

function exceptionsServeur(): string[] {
  const source = readFileSync(DEMO_SERVEUR, 'utf8')
  const m = source.match(/ECRITURES_AUTORISEES_EN_DEMO[^=]*=\s*\[([^\]]*)\]/)
  if (!m) throw new Error('ECRITURES_AUTORISEES_EN_DEMO introuvable dans backend/src/lib/demo.ts')
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).sort()
}

describe('démo — parité des exceptions de lecture seule', () => {
  it('la liste front est exactement celle du serveur', () => {
    const serveur = exceptionsServeur()
    expect(serveur.length).toBeGreaterThan(0) // jamais vacant
    // Le front compare un CHEMIN réel, le serveur un MOTIF de route : un motif paramétré (`:id`)
    // ne matcherait jamais côté front — il exigerait d'adapter `estRequeteAutoriseeEnDemo`.
    expect(serveur.every((s) => !s.includes(':'))).toBe(true)
    expect([...ECRITURES_AUTORISEES_EN_DEMO].sort()).toEqual(serveur)
  })
})

describe('estRequeteAutoriseeEnDemo', () => {
  it('lectures toujours autorisées', () => {
    expect(estRequeteAutoriseeEnDemo('GET', '/membres')).toBe(true)
    expect(estRequeteAutoriseeEnDemo('head', '/membres')).toBe(true)
  })
  it('exception exacte, requête ignorée ; jamais un préfixe', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages/simuler')).toBe(true)
    expect(estRequeteAutoriseeEnDemo('post', '/equilibrages/simuler?x=1')).toBe(true)
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages')).toBe(false)
  })
  it('toute autre écriture refusée', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/auth/logout')).toBe(false)
    expect(estRequeteAutoriseeEnDemo('PATCH', '/auth/me/langue')).toBe(false)
    expect(estRequeteAutoriseeEnDemo('DELETE', '/membres/m1/photo')).toBe(false)
  })
})
