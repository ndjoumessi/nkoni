import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOTIONS_AIDE } from './aide'

/**
 * Chaque notion du catalogue est placée au moins une fois (`notion="<id>"` dans `src/`, tests exclus) :
 * pas de texte mort à maintenir en deux langues. Lecture EN TEXTE, comme les autres gardes de parité.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return fichiers(chemin)
    return /\.tsx$/.test(nom) && !/\.test\.tsx$/.test(nom) ? [chemin] : []
  })
}

describe('aide contextuelle — usage', () => {
  it('chaque notion du catalogue est placée au moins une fois', () => {
    const source = fichiers(SRC).map((f) => readFileSync(f, 'utf8')).join('\n')
    const utilisees = new Set([...source.matchAll(/notion="([A-Za-z]+)"/g)].map((m) => m[1]))
    expect(utilisees.size).toBeGreaterThan(0) // jamais vacant
    expect(NOTIONS_AIDE.filter((n) => !utilisees.has(n))).toEqual([])
  })
})
