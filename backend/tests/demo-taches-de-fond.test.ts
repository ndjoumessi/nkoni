import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Espace de démonstration (spec 2026-09-15 §1.5) : une tâche de fond qui boucle sur les organisations
 * ne doit jamais traiter la démo — elle y écrirait des notifications chaque nuit, enverrait un e-mail
 * Resend au compte ADMIN fictif ou appellerait un PSP. Verrou TEXTUEL, sur `src/` ENTIER (pas seulement
 * `src/services/` : une future boucle de fond pourrait vivre ailleurs, une route par exemple) : chaque
 * `organisation.findMany(` doit porter `estDemo: false` dans son appel, sauf les deux comptés ci-dessous.
 * (Le comportement réel est prouvé contre Postgres dans `demo-taches-de-fond.integration.test.ts`.)
 *
 * Piège corrigé : un commentaire `// estDemo: false` PLACÉ DANS l'appel satisfaisait ce verrou textuel
 * sans que le filtre existe réellement (un commentaire ne fait rien à l'exécution). On retire donc les
 * commentaires `//` et `/* … *​/` de chaque appel extrait AVANT d'y chercher le motif. Approche
 * volontairement simple, PAS un lexer général : elle suppose qu'un appel `organisation.findMany(...)`
 * ne contient aucune chaîne littérale avec `//` (pas d'URL dans un `where`/`select`) — vrai de tous les
 * appels du dépôt aujourd'hui ; à revoir si l'un d'eux en acquérait une.
 */

const SRC = join(__dirname, '../src')

/**
 * Comptes ATTENDUS d'appels SANS `estDemo: false`, par fichier (chemin relatif à `src/`) — même
 * discipline que `runUnscoped-allowlist.test.ts` (parité STRICTE, pas une exemption de fichier entier :
 * un fichier « exempté » en bloc pouvait accumuler un second appel non filtré sans que rien ne le
 * remarque). Chaque entrée doit être justifiée ; en ajouter une n'est pas anodin.
 */
const COMPTES_ATTENDUS: Record<string, number> = {
  // Console plateforme : la démo y est LISTÉE (badge « Démo »), seule la VUE l'exclut des indicateurs.
  'services/organisation.service.ts': 1,
  // Rétention : purger les vieilles notifications et traces de la démo est inoffensif (§1.5).
  'services/retention.service.ts': 1,
}

/** Liste récursivement les fichiers `.ts` de `src/`, en EXCLUANT le client Prisma généré. */
function fichiersTs(dir: string): string[] {
  const out: string[] = []
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom)
    if (statSync(p).isDirectory()) {
      if (nom === 'generated') continue // client Prisma régénéré (gitignoré) — hors périmètre
      out.push(...fichiersTs(p))
    } else if (nom.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

/** Retire les commentaires `//` et `/* *​/` d'un extrait de code (cf. limite documentée en tête de fichier). */
function retirerCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('tâches de fond — filtre estDemo (source entière)', () => {
  const occurrences: { fichier: string; appel: string }[] = []
  for (const chemin of fichiersTs(SRC)) {
    const fichier = relative(SRC, chemin).split(sep).join('/')
    const source = readFileSync(chemin, 'utf8')
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
    expect(occurrences.length).toBeGreaterThanOrEqual(4)
  })

  it('chaque appel filtre estDemo: false, sauf les comptes attendus (parité stricte)', () => {
    const fautifsParFichier: Record<string, number> = {}
    for (const { fichier, appel } of occurrences) {
      if (!/estDemo:\s*false/.test(retirerCommentaires(appel))) {
        fautifsParFichier[fichier] = (fautifsParFichier[fichier] ?? 0) + 1
      }
    }
    expect(
      fautifsParFichier,
      'Un `organisation.findMany(` sans `estDemo: false` a été détecté hors des comptes attendus. ' +
        'S’il boucle sur les organisations actives pour leur écrire/envoyer quelque chose, ajoute le ' +
        'filtre ; sinon justifie-le et ajoute-le à COMPTES_ATTENDUS.',
    ).toEqual(COMPTES_ATTENDUS)
  })
})
