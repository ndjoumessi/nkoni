import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Espace de démonstration (spec 2026-09-15 §1.5) : une tâche de fond qui boucle sur les organisations
 * ne doit jamais traiter la démo — elle y écrirait des notifications chaque nuit, enverrait un e-mail
 * Resend au compte ADMIN fictif ou appellerait un PSP. Verrou TEXTUEL : chaque `organisation.findMany(`
 * de `src/services/` doit porter `estDemo: false` dans son appel, sauf les lectures listées ici.
 * (Le comportement réel est prouvé contre Postgres dans `demo-taches-de-fond.integration.test.ts`.)
 */

const EXCEPTIONS: Record<string, string> = {
  // Console plateforme : la démo y est LISTÉE (badge « Démo »), seule la vue l'exclut des indicateurs.
  'organisation.service.ts': 'console plateforme',
  // Rétention : purger les vieilles notifications et traces de la démo est inoffensif (§1.5).
  'retention.service.ts': 'purge de rétention',
}

const DOSSIER = join(__dirname, '../src/services')

describe('tâches de fond — filtre estDemo', () => {
  const occurrences: { fichier: string; appel: string }[] = []
  for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(DOSSIER, fichier), 'utf8')
    let i = source.indexOf('organisation.findMany(')
    while (i !== -1) {
      // L'appel entier jusqu'à la parenthèse fermante correspondante.
      let profondeur = 0
      let fin = i + 'organisation.findMany'.length
      for (; fin < source.length; fin++) {
        if (source[fin] === '(') profondeur++
        if (source[fin] === ')' && --profondeur === 0) break
      }
      occurrences.push({ fichier, appel: source.slice(i, fin + 1) })
      i = source.indexOf('organisation.findMany(', fin)
    }
  }

  it('le verrou inspecte bien des appels (pas de test vacant)', () => {
    expect(occurrences.filter((o) => !(o.fichier in EXCEPTIONS)).length).toBeGreaterThanOrEqual(4)
  })

  it('chaque boucle de fond filtre estDemo: false', () => {
    const fautifs = occurrences
      .filter((o) => !(o.fichier in EXCEPTIONS))
      .filter((o) => !/estDemo:\s*false/.test(o.appel))
      .map((o) => `${o.fichier} → ${o.appel.replace(/\s+/g, ' ').slice(0, 120)}`)
    expect(fautifs).toEqual([])
  })
})
