import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { attenduDeLAnnee, attenduCumule, dansLaFenetre } from '../src/services/attendu'
import { calculerStatutContribution } from '../src/services/statutContribution'

/**
 * « Combien ce membre doit-il ? » — la règle, et le garde qui empêche un `select` de la trahir.
 *
 * DÉCISION PRODUIT (PO, 2026-09-23) : l'HISTORISATION prime. Le montant figé à l'ouverture fait
 * foi ; le barème ne vaut que pour ce qui reste à ouvrir.
 */

const BAREMES = [
  { annee: 2024, montantAttendu: 10_000 },
  { annee: 2025, montantAttendu: 12_000 },
  { annee: 2026, montantAttendu: 15_000 },
]

describe('attendu — la règle : le snapshot s’il existe, le barème sinon', () => {
  it('une année OUVERTE vaut son snapshot, même si le barème a changé depuis', () => {
    // Le cœur de la décision : le membre a ouvert 2024 quand le barème disait 8 000. Le barème a
    // été corrigé à 10 000 depuis. Ce qu'il doit pour 2024 reste 8 000 — le montant qui lui a été
    // communiqué et sur lequel il a payé.
    const contributions = [{ annee: 2024, montantAttendu: 8_000, montantValorise: 8_000 }]
    expect(attenduDeLAnnee(2024, BAREMES, contributions)).toBe(8_000)
  })

  it('une année NON ouverte vaut le barème courant — rien n’y est figé', () => {
    expect(attenduDeLAnnee(2025, BAREMES, [])).toBe(12_000)
  })

  it('une année ni ouverte ni barémée ne vaut RIEN (et non zéro par accident)', () => {
    // `undefined` et non `0` : l'appelant doit pouvoir distinguer « rien dû » d'« inconnu ».
    expect(attenduDeLAnnee(2023, BAREMES, [])).toBeUndefined()
  })

  it('une contribution SANS snapshot retombe sur le barème — c’est le cas d’un `select` partiel', () => {
    // Comportement délibéré et documenté : en base la colonne est NOT NULL, donc ce cas ne vient
    // que d'une requête incomplète. C'est le garde textuel plus bas qui le ferme, pas le calcul.
    const contributions = [{ annee: 2024, montantValorise: 5_000 }]
    expect(attenduDeLAnnee(2024, BAREMES, contributions)).toBe(10_000)
  })
})

describe('attendu — la fenêtre d’éligibilité, écrite une fois', () => {
  const p = { anneeAdhesion: 2024, anneeCourante: 2026 }

  it('borne basse à l’adhésion, haute à l’année courante', () => {
    expect(dansLaFenetre(2023, p)).toBe(false)
    expect(dansLaFenetre(2024, p)).toBe(true)
    expect(dansLaFenetre(2026, p)).toBe(true)
    expect(dansLaFenetre(2027, p)).toBe(false)
  })

  it('une fin de contribution (DECEDE/INACTIF) resserre la borne haute', () => {
    expect(dansLaFenetre(2026, { ...p, anneeFinContribution: 2025 })).toBe(false)
    expect(dansLaFenetre(2025, { ...p, anneeFinContribution: 2025 })).toBe(true)
  })

  it('une fin POSTÉRIEURE à l’année courante ne repousse pas la borne', () => {
    expect(dansLaFenetre(2027, { ...p, anneeFinContribution: 2030 })).toBe(false)
  })
})

describe('attendu — le cumul parcourt l’union barèmes ∪ contributions', () => {
  it('additionne les années ouvertes ET les années seulement barémées', () => {
    const contributions = [{ annee: 2024, montantAttendu: 8_000, montantValorise: 8_000 }]
    // 2024 → snapshot 8 000 ; 2025 → barème 12 000 ; 2026 → barème 15 000.
    expect(
      attenduCumule({ baremes: BAREMES, contributions, anneeAdhesion: 2024, anneeCourante: 2026 }),
    ).toBe(35_000)
  })

  it('compte une année ouverte dont le barème a été SUPPRIMÉ depuis', () => {
    // Sans le parcours de l'union, cette année disparaîtrait de l'attendu et le membre
    // deviendrait « à jour » par effacement de sa dette.
    const contributions = [{ annee: 2023, montantAttendu: 7_000, montantValorise: 0 }]
    expect(
      attenduCumule({ baremes: BAREMES, contributions, anneeAdhesion: 2023, anneeCourante: 2023 }),
    ).toBe(7_000)
  })
})

describe('le défaut que ce module ferme', () => {
  it('éditer un barème après ouverture ne fait PLUS bouger ce que le membre doit', () => {
    // Avant ADR-0002, le statut lisait le barème VIVANT et le plafond de paiement le SNAPSHOT :
    // corriger un barème à la hausse rendait « en retard » un membre à jour, tout en lui
    // interdisant de payer la différence. Les deux lectures concordent désormais.
    const contributions = [{ annee: 2024, montantAttendu: 8_000, montantValorise: 8_000 }]
    const params = { baremes: [{ annee: 2024, montantAttendu: 99_000 }], contributions }

    const resteDu = Math.max(
      0,
      (contributions[0]!.montantAttendu ?? 0) - contributions[0]!.montantValorise,
    )
    const r = calculerStatutContribution({ ...params, anneeAdhesion: 2024, anneeCourante: 2024 })

    expect(resteDu).toBe(0)
    expect(r.totalAttenduCumule).toBe(8_000)
    expect(r.statut).toBe('A_JOUR')
  })
})

/**
 * GARDE TEXTUEL — tout `select` de contributions qui lit `montantValorise` lit aussi
 * `montantAttendu`.
 *
 * C'est le SEUL moyen de perdre le snapshot : la colonne est NOT NULL en base, jamais absente
 * d'une ligne. Une requête qui l'omet ferait retomber le calcul sur le barème vivant, en silence,
 * avec un montant plausible — exactement le défaut que ce chantier ferme. Le typage ne peut pas
 * l'attraper : plusieurs services reçoivent un client Prisma typé `any`.
 *
 * Trois `select` l'omettaient au début de ce chantier (`membreStatut`, `dashboard`,
 * `notification-scheduler`) ; deux autres ont été trouvés par l'exécution.
 */
describe('garde — aucun `select` ne perd le snapshot', () => {
  const RACINE = join(__dirname, '..', 'src')

  function fichiers(dossier: string): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
      if (e.name === 'generated') return []
      const chemin = join(dossier, e.name)
      if (e.isDirectory()) return fichiers(chemin)
      return e.name.endsWith('.ts') ? [chemin] : []
    })
  }

  const sources = fichiers(RACINE)

  it('inspecte réellement les sources (le garde n’est pas vacant)', () => {
    const avecValorise = sources.filter((f) => readFileSync(f, 'utf8').includes('montantValorise'))
    expect(avecValorise.length).toBeGreaterThan(5)
  })

  it('tout `select` de contributions lisant `montantValorise` lit aussi `montantAttendu`', () => {
    const fautives: string[] = []
    for (const f of sources) {
      const lignes = readFileSync(f, 'utf8').split('\n')
      lignes.forEach((ligne, i) => {
        // `select` d'une seule ligne portant `montantValorise` sans son snapshot.
        if (!/select:\s*\{[^}]*montantValorise/.test(ligne)) return
        if (/montantAttendu/.test(ligne)) return
        // `equilibrage` écrit la valorisation, il ne calcule pas l'attendu : hors sujet.
        if (f.endsWith('equilibrage.service.ts')) return
        fautives.push(`${f.slice(RACINE.length + 1)}:${i + 1}`)
      })
    }
    expect(fautives).toEqual([])
  })
})
