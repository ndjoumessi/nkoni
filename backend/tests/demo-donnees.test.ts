import { describe, it, expect } from 'vitest'
import { calculerStatutContribution } from '../src/services/statutContribution'
import {
  BRANCHES_DEMO,
  DEPENSES_DEMO,
  NOMBRE_MEMBRES_DEMO,
  baremesDemo,
  construireMembresDemo,
  planifierVersementsDemo,
} from '../src/services/demo-donnees'

/**
 * Description de la démo (spec 2026-09-15 §3.1), sans base : volumes, répartition des statuts de
 * cotisation, déterminisme, et cohérence avec la règle de statut RÉELLE (`calculerStatutContribution`).
 */

const ANNEE = 2027
const NOW = new Date('2027-05-20T10:00:00.000Z')

describe('construireMembresDemo', () => {
  const membres = construireMembresDemo(ANNEE)

  it('45 membres, noms complets uniques, 3 branches utilisées', () => {
    expect(membres).toHaveLength(NOMBRE_MEMBRES_DEMO)
    expect(new Set(membres.map((m) => `${m.prenom} ${m.nom}`)).size).toBe(NOMBRE_MEMBRES_DEMO)
    expect(new Set(membres.map((m) => m.brancheIndex))).toEqual(new Set([0, 1, 2]))
    expect(BRANCHES_DEMO).toHaveLength(3)
  })

  it('statuts : 42 actifs, 2 inactifs, 1 décédé ; profils des actifs 25 / 11 / 6', () => {
    expect(membres.filter((m) => m.statut === 'INACTIF')).toHaveLength(2)
    expect(membres.filter((m) => m.statut === 'DECEDE')).toHaveLength(1)
    const actifs = membres.filter((m) => m.statut === 'ACTIF')
    expect(actifs).toHaveLength(42)
    expect(actifs.filter((m) => m.profil === 'A_JOUR')).toHaveLength(25)
    expect(actifs.filter((m) => m.profil === 'PARTIEL')).toHaveLength(11)
    expect(actifs.filter((m) => m.profil === 'EN_RETARD')).toHaveLength(6)
  })

  it('la présidente (indice 0) est active et à jour ; les non-actifs ont une fin de contribution', () => {
    expect(membres[0]).toMatchObject({ statut: 'ACTIF', profil: 'A_JOUR', anneeAdhesion: ANNEE - 2 })
    for (const m of membres.filter((x) => x.statut !== 'ACTIF')) expect(m.anneeFinContribution).toBe(ANNEE - 1)
  })

  it('téléphones fictifs dans la plage 600 non attribuée, jamais d’adhésion future', () => {
    for (const m of membres) {
      expect(m.telephone).toMatch(/^6000000\d{2}$/)
      expect(m.anneeAdhesion).toBeLessThanOrEqual(ANNEE)
    }
  })

  it('déterministe', () => {
    expect(construireMembresDemo(ANNEE)).toEqual(membres)
  })
})

describe('planifierVersementsDemo', () => {
  const membres = construireMembresDemo(ANNEE)
  const baremes = baremesDemo(ANNEE)
  const plan = planifierVersementsDemo(membres, ANNEE, NOW)

  it('aucun versement futur, trié par date', () => {
    for (const v of plan) expect(v.date.getTime()).toBeLessThanOrEqual(NOW.getTime())
    const dates = plan.map((v) => v.date.getTime())
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
  })

  it('chaque actif obtient le statut de son profil avec la règle réelle', () => {
    const attendu = { A_JOUR: 'A_JOUR', PARTIEL: 'PARTIEL', EN_RETARD: 'NON_A_JOUR' } as const
    for (const m of membres.filter((x) => x.statut === 'ACTIF')) {
      const parAnnee = new Map<number, number>()
      for (const v of plan.filter((x) => x.cleMembre === m.cle)) parAnnee.set(v.annee, (parAnnee.get(v.annee) ?? 0) + v.montant)
      const { statut } = calculerStatutContribution({
        baremes,
        contributions: [...parAnnee].map(([annee, montantValorise]) => ({ annee, montantValorise })),
        anneeAdhesion: m.anneeAdhesion,
        anneeFinContribution: m.anneeFinContribution,
        anneeCourante: ANNEE,
      })
      expect(statut, `${m.prenom} ${m.nom}`).toBe(attendu[m.profil])
    }
  })

  it('volume réaliste (plus de 100 versements) et déterministe', () => {
    expect(plan.length).toBeGreaterThan(100)
    expect(planifierVersementsDemo(membres, ANNEE, NOW)).toEqual(plan)
  })

  it('en tout début d’année, le versement de l’année courante reste daté dans l’année', () => {
    const debut = new Date('2027-01-01T00:30:00.000Z')
    const courants = planifierVersementsDemo(membres, ANNEE, debut).filter((v) => v.annee === ANNEE)
    expect(courants.length).toBeGreaterThan(0)
    for (const v of courants) expect(v.date.getUTCFullYear()).toBe(ANNEE)
  })
})

describe('DEPENSES_DEMO', () => {
  it('8 dépenses couvrant tout le workflow, dont une rejetée avec motif', () => {
    expect(DEPENSES_DEMO).toHaveLength(8)
    expect(new Set(DEPENSES_DEMO.map((d) => d.cible))).toEqual(new Set(['BROUILLON', 'EN_ATTENTE', 'APPROUVEE', 'REJETEE', 'PAYEE']))
    expect(DEPENSES_DEMO.find((d) => d.cible === 'REJETEE')?.motifRejet).toBeTruthy()
  })
})
