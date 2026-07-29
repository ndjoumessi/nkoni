import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROLES_ARGENT, ROLES_BUREAU } from '../src/middlewares/permissions'

/**
 * Garde-fou de PROSE/CODE : `ROLES_ARGENT` et `ROLES_BUREAU` sont des LISTES CANONIQUES définies une
 * seule fois dans `permissions.ts`. Deux fois cette session, ces listes avaient été RECOPIÉES en dur
 * dans des routes (sous des noms divers) et commençaient à diverger — la façon habituelle dont ces
 * constantes pourrissent en silence. tsc/oxlint ne l'attrapent pas (une liste littérale valide
 * compile). Ce test échoue si une route redéfinit un tableau de rôles dont la COMPOSITION (triée)
 * est EXACTEMENT celle d'une liste canonique → « utilise la constante ».
 *
 * Volontairement ÉTROIT : il ne bannit pas toute liste de rôles littérale (ROLES_APPROBATION =
 * ADMIN/PRESIDENT/COMMISSAIRE_COMPTES, ou `['ADMIN','PRESIDENT']` pour la désignation du chef sont
 * légitimement distincts et doivent rester permis). Il ne vise QUE la re-copie des deux canoniques.
 *
 * Modèle : `runUnscoped-allowlist.test.ts` — un invariant tenu par un test exécutable, pas par la
 * discipline.
 */

const CANONIQUES: Record<string, string[]> = {
  ROLES_ARGENT: [...ROLES_ARGENT].sort(),
  ROLES_BUREAU: [...ROLES_BUREAU].sort(),
}
const empreinte = (roles: string[]): string => [...roles].sort().join(',')
const EMPREINTES = new Map(Object.entries(CANONIQUES).map(([nom, r]) => [empreinte(r), nom]))

/** Retire les commentaires (bloc + ligne) : le garde vise le CODE, pas la prose qui DÉCRIT le
 *  pattern (un docblock « gardé par requireRoles([...]) » est de la documentation légitime). */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Extrait les tableaux littéraux de chaînes MAJUSCULES (`['ADMIN', 'PRESIDENT', …]`) d'un source. */
function tableauxDeRoles(source: string): string[][] {
  const out: string[][] = []
  // Tableau dont TOUS les éléments sont des chaînes 'UPPER_SNAKE' (les valeurs de l'enum Role).
  const re = /\[\s*('[A-Z_]+'(?:\s*,\s*'[A-Z_]+')*)\s*,?\s*\]/g
  for (const m of sansCommentaires(source).matchAll(re)) {
    const membres = m[1].split(',').map((s) => s.trim().replace(/'/g, ''))
    out.push(membres)
  }
  return out
}

describe('Parité des listes de rôles canoniques ↔ routes', () => {
  const routesDir = join(__dirname, '../src/routes')
  const fichiers = readdirSync(routesDir).filter((f) => f.endsWith('.ts'))

  it('trouve bien des fichiers de routes à inspecter (le test ne garde rien s’il est vide)', () => {
    expect(fichiers.length).toBeGreaterThan(0)
  })

  it('aucune route ne recopie la composition de ROLES_ARGENT ou ROLES_BUREAU', () => {
    const fautes: string[] = []
    for (const f of fichiers) {
      const source = readFileSync(join(routesDir, f), 'utf8')
      for (const roles of tableauxDeRoles(source)) {
        const nom = EMPREINTES.get(empreinte(roles))
        if (nom) fautes.push(`${f} : [${roles.join(', ')}] duplique ${nom} — importe la constante de permissions.ts`)
      }
    }
    expect(fautes, fautes.join('\n')).toEqual([])
  })
})
