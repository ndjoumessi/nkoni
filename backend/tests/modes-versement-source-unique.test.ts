import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { MODES_VERSEMENT } from '../src/lib/modes-versement'

/**
 * Garde-fou de PROSE/CODE : `MODES_VERSEMENT` (+ le type `ModeVersement`) est la SOURCE UNIQUE des
 * modes de versement, définie une seule fois dans `lib/modes-versement.ts`. Cette liste avait été
 * RECOPIÉE en dur dans QUATRE endroits (sous les noms `MODE_ENUM`/`MODES` dans trois routes, et une
 * union `'ESPECES' | … | 'AUTRE'` écrite à la main dans `releve.service.ts`) avant d'être consolidée.
 * tsc/oxlint ne l'attrapent pas (un littéral valide compile), et `modes-versement-parity.test.ts`
 * garde la parité constante ↔ enum Postgres mais NON l'absence de nouvelle recopie ailleurs.
 *
 * Ce test échoue si un fichier du backend reconstruit l'ensemble des modes à la main :
 *   - un tableau littéral de chaînes MAJUSCULES contenant à la fois `'ESPECES'` ET `'MOBILE_MONEY'`
 *   - une union de type contenant ces deux mêmes littéraux
 *   - un objet littéral dont les CLÉS couvrent la signature (table de libellés `{ ESPECES: … }`) —
 *     l'angle mort du 1ᵉʳ jet, découvert dans recu-pdf/releve, désormais couvert
 * → « importe MODES_VERSEMENT / type ModeVersement, ou passe par le catalogue i18n (libelleModeVersement) ».
 *
 * Volontairement ÉTROIT : la SIGNATURE est `ESPECES` + `MOBILE_MONEY` ENSEMBLE (une liste de modes),
 * pas un `'ESPECES'` isolé — le défaut légitime d'`amendes.route.ts` (`modePaiement ?? 'ESPECES'`)
 * reste permis. La source unique elle-même et le code généré sont exclus.
 *
 * Modèle : `roles-lists-parity.test.ts` — un invariant tenu par un test exécutable, pas par la
 * discipline (mêmes conventions : commentaires ignorés, garde anti-vacant).
 */

// Deux marqueurs qui, présents ENSEMBLE dans un même littéral, trahissent une liste de modes recopiée.
const SIGNATURE = ['ESPECES', 'MOBILE_MONEY'] as const
// Sanity : ces marqueurs doivent bien appartenir à la source unique (sinon le test ne garde rien de réel).
for (const marqueur of SIGNATURE) {
  if (!(MODES_VERSEMENT as readonly string[]).includes(marqueur)) {
    throw new Error(`SIGNATURE incohérente : '${marqueur}' absent de MODES_VERSEMENT`)
  }
}

/** Retire les commentaires (bloc + ligne) : le garde vise le CODE, pas la prose qui décrit le pattern. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Un groupe de littéraux 'UPPER_SNAKE' contient-il TOUTE la signature ? */
function contientSignature(membres: string[]): boolean {
  return SIGNATURE.every((s) => membres.includes(s))
}

/**
 * Extrait les ensembles de chaînes MAJUSCULES reconstruisant potentiellement les modes :
 *   - tableaux littéraux  `['ESPECES', 'TIERS', 'MOBILE_MONEY', 'AUTRE']`
 *   - unions de type      `'ESPECES' | 'TIERS' | 'MOBILE_MONEY' | 'AUTRE'`
 *   - tables de libellés  `{ ESPECES: 'Espèces', …, MOBILE_MONEY: 'Mobile Money', … }`
 *     (le cas qui manquait : un `Record<string,string>` par mode, angle mort du 1ᵉʳ garde — vécu
 *     dans recu-pdf/releve, documents remis aux membres où un mode absent rendait `undefined`).
 */
function ensemblesDeModes(source: string): string[][] {
  const propre = sansCommentaires(source)
  const out: string[][] = []
  // Tableau dont TOUS les éléments sont des chaînes 'UPPER_SNAKE'.
  const reTableau = /\[\s*('[A-Z_]+'(?:\s*,\s*'[A-Z_]+')*)\s*,?\s*\]/g
  for (const m of propre.matchAll(reTableau)) {
    out.push(m[1].split(',').map((s) => s.trim().replace(/'/g, '')))
  }
  // Union d'au moins deux chaînes 'UPPER_SNAKE' séparées par `|`.
  const reUnion = /'[A-Z_]+'(?:\s*\|\s*'[A-Z_]+')+/g
  for (const m of propre.matchAll(reUnion)) {
    out.push(m[0].split('|').map((s) => s.trim().replace(/'/g, '')))
  }
  // Objet littéral PLAT (sans accolade imbriquée) : on collecte ses CLÉS 'UPPER_SNAKE' (bornées
  // par `:`), nues ou entre guillemets. Une clé dottée/minuscule (`'commun.modeVersement.ESPECES'`)
  // n'est PAS une clé de mode et n'est donc pas capturée — pas de faux positif sur le catalogue i18n.
  const reObjet = /\{[^{}]*\}/g
  const reCle = /(?:'([A-Z_]+)'|\b([A-Z_]+))\s*:/g
  for (const bloc of propre.matchAll(reObjet)) {
    const cles: string[] = []
    for (const c of bloc[0].matchAll(reCle)) cles.push(c[1] ?? c[2])
    if (cles.length > 0) out.push(cles)
  }
  return out
}

/** Parcourt récursivement `src/`, hors code généré. */
function fichiersTs(racine: string): string[] {
  const acc: string[] = []
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) {
      if (entree === 'generated') continue
      acc.push(...fichiersTs(chemin))
    } else if (entree.endsWith('.ts')) {
      acc.push(chemin)
    }
  }
  return acc
}

describe('Source unique des modes de versement ↔ backend', () => {
  const srcDir = join(__dirname, '../src')
  const sourceUnique = join(srcDir, 'lib', 'modes-versement.ts')
  const fichiers = fichiersTs(srcDir).filter((f) => f !== sourceUnique)

  it('trouve bien des fichiers à inspecter (le test ne garde rien s’il est vide)', () => {
    expect(fichiers.length).toBeGreaterThan(0)
  })

  it('aucun fichier ne recopie l’ensemble des modes (tableau, union ou table de libellés)', () => {
    const fautes: string[] = []
    for (const f of fichiers) {
      const source = readFileSync(f, 'utf8')
      for (const membres of ensemblesDeModes(source)) {
        if (contientSignature(membres)) {
          fautes.push(
            `${relative(srcDir, f)} : [${membres.join(', ')}] recopie les modes — importe MODES_VERSEMENT / type ModeVersement de lib/modes-versement.ts`,
          )
        }
      }
    }
    expect(fautes, fautes.join('\n')).toEqual([])
  })
})
