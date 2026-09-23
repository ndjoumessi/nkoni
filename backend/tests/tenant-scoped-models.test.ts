import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCOPED_MODELS } from '../src/lib/tenant-extension'

/**
 * Garde-fou d'ISOLATION (audit C1) — et ce qu'il garde a CHANGÉ.
 *
 * `SCOPED_MODELS` n'est plus une allowlist manuelle : elle est DÉRIVÉE du client Prisma généré
 * (cf. `tenant-extension.ts`). Le risque « un modèle portant `organisationId` oublié dans le Set »
 * a donc disparu — il n'y a plus de Set où l'oublier.
 *
 * Ce test n'est pas devenu inutile pour autant : il compare deux dérivations INDÉPENDANTES du même
 * fait — celle du client généré (au chargement) et celle de `schema.prisma` (ici, par lecture).
 * Un écart entre les deux ne signifie plus qu'un humain a oublié une ligne, mais que **le client
 * généré est PÉRIMÉ** : le schéma a bougé et `npx prisma generate` n'a pas été relancé. C'est un
 * défaut vécu, consigné dans CLAUDE.md, et dont la conséquence est ici maximale — un modèle
 * fraîchement scopé ne serait pas isolé tant que le client n'est pas régénéré.
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
 * Garde-fou de PROSE : le nombre de modèles scopés est annoncé en toutes lettres dans CLAUDE.md,
 * recopié à la main. Rien ne le vérifiait, donc il dérivait en silence —
 * trois compteurs décrivant le MÊME Set ont fini par afficher trois valeurs différentes (27 dans
 * le docblock de `tenant-extension.ts`, 28 dans `CLAUDE.md`, 30 dans le libellé du fixture de
 * purge) pour 29 modèles réels. Le libellé du fixture est depuis DÉRIVÉ de `SCOPED_MODELS.size` ;
 * la prose, elle, ne peut pas l'être — d'où ce test.
 *
 * Il ne reste qu'UNE source depuis que la liste est dérivée : le docblock de
 * `tenant-extension.ts` n'annonce plus de compte, puisqu'il ne recopie plus rien. CLAUDE.md, lui,
 * est de la prose humaine et continue d'en annoncer un.
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
