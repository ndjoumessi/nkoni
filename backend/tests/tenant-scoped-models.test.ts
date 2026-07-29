import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCOPED_MODELS } from '../src/lib/tenant-extension'

/**
 * Garde-fou d'ISOLATION (audit C1) : `SCOPED_MODELS` est une allowlist manuelle — un modèle
 * portant `organisationId` mais OUBLIÉ dans le Set ne serait PAS isolé (fail-open silencieux).
 * Ce test parse le schéma Prisma et exige une PARITÉ STRICTE dans les deux sens : tout modèle
 * avec le champ scalaire `organisationId` doit être scopé, et le Set ne doit contenir aucun extra.
 */
describe('Isolation multi-tenant — parité SCOPED_MODELS ↔ schéma Prisma', () => {
  it('tout modèle portant `organisationId` est déclaré scopé (et réciproquement)', () => {
    const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8')
    const modelesAvecOrg = new Set<string>()
    const regexModel = /model\s+(\w+)\s*\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = regexModel.exec(schema)) !== null) {
      const nom = m[1]
      const corps = m[2]
      // Champ SCALAIRE `organisationId` en début de ligne (pas les `fields: [organisationId]`
      // des relations ni les `@@unique([organisationId, …])`).
      if (/(^|\n)\s*organisationId\s+\w/.test(corps)) modelesAvecOrg.add(nom)
    }
    expect([...modelesAvecOrg].sort()).toEqual([...SCOPED_MODELS].sort())
  })
})

/**
 * Garde-fou de PROSE : le nombre de modèles scopés est annoncé en toutes lettres à plusieurs
 * endroits, chaque fois recopié à la main. Rien ne le vérifiait, donc il dérivait en silence —
 * trois compteurs décrivant le MÊME Set ont fini par afficher trois valeurs différentes (27 dans
 * le docblock de `tenant-extension.ts`, 28 dans `CLAUDE.md`, 30 dans le libellé du fixture de
 * purge) pour 29 modèles réels. Le libellé du fixture est depuis DÉRIVÉ de `SCOPED_MODELS.size` ;
 * la prose, elle, ne peut pas l'être — d'où ce test.
 *
 * Chaque source a son propre MOTIF : la formulation diffère d'un fichier à l'autre, et un motif
 * trop large attraperait des nombres voisins sans rapport (le docblock parle de « 2 tables de
 * jointure M2M » deux lignes plus bas — elles ne sont pas le compte des modèles scopés).
 *
 * Les fichiers étant lus par chemin, le test échoue aussi si l'un est déplacé ou renommé
 * (`readFileSync` lève) : c'est voulu, un garde-fou muet ne garde rien.
 */
const SOURCES_PROSE = [
  {
    nom: 'CLAUDE.md',
    chemin: join(__dirname, '../../CLAUDE.md'),
    // « les 29 `SCOPED_MODELS` » ET « l'un des 29 SCOPED_MODELS » (backticks optionnels).
    motif: /(\d+)\s+`?SCOPED_MODELS`?/g,
  },
  {
    nom: 'src/lib/tenant-extension.ts',
    chemin: join(__dirname, '../src/lib/tenant-extension.ts'),
    // « Les 29 modèles métier scopés » — volontairement ancré sur les 3 mots, pour ne PAS
    // capturer « les 2 tables de jointure M2M » de la ligne suivante.
    motif: /(\d+)\s+modèles\s+métier\s+scopés/g,
  },
]

describe('Isolation multi-tenant — parité de la PROSE ↔ SCOPED_MODELS.size', () => {
  for (const { nom, chemin, motif } of SOURCES_PROSE) {
    it(`${nom} : chaque nombre annoncé vaut le compte réel`, () => {
      const contenu = readFileSync(chemin, 'utf8')
      const mentions = [...contenu.matchAll(motif)].map((m) => Number(m[1]))

      // SANS cette garde, le test passerait au VERT le jour où une reformulation ferait disparaître
      // toutes les mentions : zéro correspondance ⇒ zéro assertion ⇒ faux sentiment de couverture.
      expect(
        mentions.length,
        `aucune mention chiffrée trouvée dans ${nom} — le test ne garde plus rien`,
      ).toBeGreaterThan(0)

      const faux = mentions.filter((n) => n !== SCOPED_MODELS.size)
      expect(
        faux,
        `${nom} annonce ${faux.join(', ')} alors que SCOPED_MODELS en compte ${SCOPED_MODELS.size}`,
      ).toEqual([])
    })
  }
})
