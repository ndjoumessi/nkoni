import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Garde de PARITÉ du mouvement (`src/index.css`) — trois invariants que `tsc` et `oxlint` ne
 * voient pas, une feuille de style restant valide quelle que soit la courbe qu'on y écrit.
 *
 * Ils sont ici parce qu'ils ont chacun coûté une mesure :
 *  1. une ENTRÉE prend `--ease-sortie`, une SORTIE prend `--ease-retrait`. Les deux courbes ne
 *     sont pas interchangeables : la première consomme le mouvement d'un coup (47 % dès la
 *     première image sur 140 ms) — parfait à l'ouverture, où l'œil guette le départ, illisible
 *     à la fermeture, où elle réduit une sortie de 140 ms à ~90 ms vus ;
 *  2. une sortie est toujours PLUS COURTE que son entrée — l'utilisateur en a déjà fini ;
 *  3. aucune des deux familles ne part dans l'autre sens (`--ease-retrait` sur une entrée
 *     retarderait le départ, soit exactement ce que la règle « jamais d'ease-in » interdit).
 *
 * Le nom `--ease-sortie` désigne aujourd'hui la courbe des ENTRÉES : c'est un legs, documenté
 * dans `index.css`. Le test s'appuie sur les classes (`-in` / `-out`), pas sur ce nom.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

interface Animation {
  classe: string
  duree: number
  jeton: string
}

/** Extrait les `.nk-…-in` / `.nk-…-out` et leur `animation: <nom> <durée> var(<jeton>)`. */
function lireAnimations(suffixe: 'in' | 'out'): Animation[] {
  const motif = new RegExp(
    String.raw`\.nk-([\w-]+)-${suffixe}\s*\{\s*animation:\s*\S+\s+([\d.]+)s\s+var\((--[\w-]+)\)`,
    'g',
  )
  return [...CSS.matchAll(motif)].map((m) => ({
    classe: `nk-${m[1]}-${suffixe}`,
    duree: Number(m[2]),
    jeton: m[3],
  }))
}

const entrees = lireAnimations('in')
const sorties = lireAnimations('out')

describe('Mouvement — parité des jetons de courbe', () => {
  it('trouve bien les animations (sinon tout ce qui suit passerait à vide)', () => {
    expect(entrees.length).toBeGreaterThanOrEqual(4)
    expect(sorties.length).toBeGreaterThanOrEqual(4)
  })

  it('toute SORTIE utilise --ease-retrait', () => {
    for (const s of sorties) {
      expect(s.jeton, `${s.classe} doit sortir sur --ease-retrait`).toBe('--ease-retrait')
    }
  })

  it('toute ENTRÉE utilise --ease-sortie (la courbe au départ franc)', () => {
    for (const e of entrees) {
      expect(e.jeton, `${e.classe} doit entrer sur --ease-sortie`).toBe('--ease-sortie')
    }
    // `nk-reveal` est une entrée qui ne porte pas le suffixe `-in` : vérifiée à part.
    expect(CSS).toMatch(/animation:\s*nkReveal\s+[\d.]+s\s+var\(--ease-sortie\)/)
  })

  it('chaque sortie est PLUS COURTE que l’entrée qu’elle referme', () => {
    let paires = 0
    for (const s of sorties) {
      const racine = s.classe.slice(0, -'-out'.length)
      const e = entrees.find((x) => x.classe === `${racine}-in`)
      if (!e) continue
      paires += 1
      expect(s.duree, `${s.classe} (${s.duree}s) doit être < ${e.classe} (${e.duree}s)`).toBeLessThan(
        e.duree,
      )
    }
    // Anti-vacuité : si les noms divergeaient, aucune paire ne serait comparée.
    expect(paires).toBeGreaterThanOrEqual(3)
  })

  it('les deux courbes restent des ease-OUT (départ franc, jamais retardé)', () => {
    for (const jeton of ['--ease-sortie', '--ease-retrait']) {
      const m = CSS.match(new RegExp(String.raw`${jeton}:\s*cubic-bezier\(([^)]+)\)`))
      expect(m, `${jeton} doit être déclaré en cubic-bezier`).not.toBeNull()
      // cubic-bezier(x1, y1, x2, y2) → y1 est l'indice 1. (Lire x2 par erreur rendait ce test
      // vacant : x2 est positif sur toutes les courbes plausibles, ease-in compris.)
      const [, y1] = m![1].split(',').map((v) => Number(v.trim()))
      // y1 > 0 ⇒ la sortie démarre immédiatement. Un y1 nul ou négatif, c'est un ease-in.
      expect(y1, `${jeton} retarde son départ (y1=${y1}) : interdit sur de l'interface`).toBeGreaterThan(0)
    }
  })
})
