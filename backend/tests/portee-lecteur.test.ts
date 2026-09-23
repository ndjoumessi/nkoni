import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  lecteurRestreint,
  porteeMembre,
  porteeViaMembre,
  membreDuCompte,
  exigerPortee,
  HorsPorteeError,
} from '../src/lib/portee-lecteur'

/**
 * Portée de lecture — la règle « un MEMBRE_SIMPLE ne voit que le sien », et le garde qui empêche
 * ses cinq encodages de repousser.
 */

const simple = { role: 'MEMBRE_SIMPLE', sub: 'u-simple' }
const tresoriere = { role: 'TRESORIERE', sub: 'u-tres' }

describe('portée du lecteur — la règle', () => {
  it('seul MEMBRE_SIMPLE est borné à sa propre fiche', () => {
    expect(lecteurRestreint(simple)).toBe(true)
    for (const role of ['ADMIN', 'PRESIDENT', 'TRESORIERE', 'SECRETAIRE', 'COMMISSAIRE_COMPTES']) {
      expect(lecteurRestreint({ role, sub: 'u' })).toBe(false)
    }
  })

  it('un lecteur de bureau n’est pas filtré — `undefined`, pas un `where` vide', () => {
    // `{}` et `undefined` ne sont PAS interchangeables partout chez Prisma : rendre `undefined`
    // laisse l'appelant décider (`?? {}` pour un spread, ou omettre le `where`).
    expect(porteeMembre(tresoriere)).toBeUndefined()
    expect(porteeViaMembre(tresoriere)).toBeUndefined()
  })

  it('les deux formes du filtre décrivent le même fait', () => {
    expect(porteeMembre(simple)).toEqual({ compteUtilisateurId: 'u-simple' })
    expect(porteeViaMembre(simple)).toEqual({ membre: { compteUtilisateurId: 'u-simple' } })
  })

  it('`membreDuCompte` ne dépend PAS du rôle — c’est du self-service, pas une restriction', () => {
    // La différence compte : `/moi/*` et la carte résolvent TOUJOURS la fiche du compte, même pour
    // un ADMIN. Confondre les deux donnerait à un administrateur la vue de toute l'organisation
    // sur une route censée ne montrer que la sienne.
    expect(membreDuCompte('u-tres')).toEqual({ compteUtilisateurId: 'u-tres' })
    expect(membreDuCompte(undefined)).toEqual({ compteUtilisateurId: '' })
  })
})

describe('portée du lecteur — le refus', () => {
  it('ne refuse rien à un lecteur de bureau', () => {
    expect(() => exigerPortee(tresoriere, 'u-autre', 'membres.introuvable')).not.toThrow()
  })

  it('laisse passer le lecteur sur SA ressource', () => {
    expect(() => exigerPortee(simple, 'u-simple', 'membres.introuvable')).not.toThrow()
  })

  it('refuse en 404 — jamais 403, jamais un statut qui révèle l’existence', () => {
    let leve: unknown
    try {
      exigerPortee(simple, 'u-autre', 'membres.introuvable')
    } catch (e) {
      leve = e
    }
    expect(leve).toBeInstanceOf(HorsPorteeError)
    expect((leve as HorsPorteeError).statutHttp).toBe(404)
    expect((leve as HorsPorteeError).cleMessage).toBe('membres.introuvable')
  })

  it('une ressource sans compte rattaché est hors portée d’un lecteur borné', () => {
    // Fiche membre non liée à un compte : `null !== 'u-simple'` → refus. C'est le bon sens du
    // refus — un MEMBRE_SIMPLE ne doit pas lire la fiche d'un membre sans compte.
    expect(() => exigerPortee(simple, null, 'membres.introuvable')).toThrow(HorsPorteeError)
    expect(() => exigerPortee(simple, undefined, 'membres.introuvable')).toThrow(HorsPorteeError)
  })
})

/**
 * GARDE TEXTUEL — aucune route ne réencode la règle d'accès.
 *
 * C'est le point de la carte « cinq encodages, aucun seam » : la règle était réécrite sous cinq
 * formes dans une vingtaine de handlers, avec DEUX refus différents. Rien dans le typage
 * n'empêche d'en écrire une sixième. Ce garde n'a AUCUNE exception, et c'est délibéré : les neuf
 * sites de self-service qui auraient pu en constituer une passent par `membreDuCompte`.
 */
describe('garde — la règle d’accès n’est écrite qu’ici', () => {
  const DOSSIER = join(__dirname, '..', 'src', 'routes')
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.route.ts'))

  it('inspecte réellement les routes (le garde n’est pas vacant)', () => {
    expect(fichiers.length).toBeGreaterThan(20)
  })

  it('aucune route ne construit `{ compteUtilisateurId: <le compte connecté> }` à la main', () => {
    const fautives: string[] = []
    for (const f of fichiers) {
      const source = readFileSync(join(DOSSIER, f), 'utf8')
      source.split('\n').forEach((ligne, i) => {
        if (/compteUtilisateurId:\s*(req\.user\.)?sub\b/.test(ligne)) {
          fautives.push(`${f}:${i + 1}`)
        }
      })
    }
    expect(fautives).toEqual([])
  })

  it('aucune route ne teste le rôle MEMBRE_SIMPLE pour construire un filtre d’accès', () => {
    // Le test de rôle reste légitime AILLEURS (aiguiller une vue, choisir un plafond) ; ce qui ne
    // doit plus exister, c'est le couple « je teste le rôle » + « j'écris le filtre » dans le même
    // souffle. On l'attrape par la fenêtre de trois lignes qui suit le test.
    const fautives: string[] = []
    for (const f of fichiers) {
      const lignes = readFileSync(join(DOSSIER, f), 'utf8').split('\n')
      lignes.forEach((ligne, i) => {
        if (!/MEMBRE_SIMPLE/.test(ligne)) return
        const fenetre = lignes.slice(i, i + 4).join('\n')
        if (!/compteUtilisateurId/.test(fenetre)) return
        // Une fenêtre qui passe DÉJÀ par le module est conforme : c'est le commentaire qui nomme
        // le rôle, au-dessus de l'appel correct (cas de `releve.route.ts`).
        if (/exigerPortee|portee(Membre|ViaMembre)|membreDuCompte/.test(fenetre)) return
        fautives.push(`${f}:${i + 1}`)
      })
    }
    expect(fautives).toEqual([])
  })
})
