import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Les fichiers `*.integration.test.ts` s'exécutent EN PARALLÈLE sur UNE base partagée. Une tâche qui
 * boucle sur TOUTES les organisations (`…ToutesOrgs(`) lancée sans restriction traite aussi les
 * fixtures des autres fichiers en cours : notifications créées sous leurs pieds, décomptes « avant /
 * après » faussés (ex. le snapshot d'isolation de `organisation-purge.integration.test.ts`).
 *
 * Règle vérifiée ici : tout fichier d'intégration qui appelle une tâche `…ToutesOrgs(` passe par
 * `envelopperPrisma` (`tests/support/prisma-espion.ts`) pour ne restituer que SES organisations.
 * `retention.integration.test.ts` est hors règle : `purgerRetention` ne boucle pas via `…ToutesOrgs`,
 * ne touche que des lignes plus vieilles que les seuils (aucune fixture n'en crée) et refuse toute base
 * dont le nom ne contient ni `_it_` ni `test`.
 */
const DOSSIER = __dirname

describe('tests d’intégration — tâches globales restreintes', () => {
  it('chaque appel `…ToutesOrgs(` d’un fichier d’intégration passe par envelopperPrisma', () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.integration.test.ts'))
    const appelants = fichiers.filter((f) => /\w+ToutesOrgs\(/.test(readFileSync(join(DOSSIER, f), 'utf8')))
    expect(appelants.length).toBeGreaterThan(0) // jamais vacant
    const nonRestreints = appelants.filter((f) => !readFileSync(join(DOSSIER, f), 'utf8').includes('envelopperPrisma('))
    expect(nonRestreints).toEqual([])
  })

  it('aucun appel de tâche globale ne reçoit directement le client réel (vérifié APPEL par appel)', () => {
    // Le test ci-dessus est par FICHIER : un second appel sur le client brut y passerait inaperçu.
    // `regenererDemo` boucle aussi sur toutes les démos de la base.
    const APPEL_BRUT = /(\w+ToutesOrgs|regenererDemo)\(\s*(prismaEtendu|prisma|base)\b/
    const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.integration.test.ts'))
    const appels = fichiers.flatMap((f) =>
      readFileSync(join(DOSSIER, f), 'utf8')
        .split('\n')
        .filter((l) => /(\w+ToutesOrgs|regenererDemo)\(/.test(l) && !l.trim().startsWith('import') && !l.trim().startsWith('*'))
        .map((l) => ({ f, l: l.trim() })),
    )
    expect(appels.length).toBeGreaterThan(0) // jamais vacant
    expect(appels.filter(({ l }) => APPEL_BRUT.test(l))).toEqual([])
  })
})
