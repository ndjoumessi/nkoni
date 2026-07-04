import { describe, it, expect } from 'vitest'
import {
  peutVoirConflit,
  peutModifierConflit,
  type ConflitAcces,
  type DemandeurConflit,
} from '../src/services/conflit.service'
import type { Role } from '../src/middlewares/permissions'

/**
 * V2 (§4.4) — Tests EXHAUSTIFS de la règle d'accès aux conflits (cœur sensible du
 * module). On balaie la matrice complète { niveau × rôle × identité }.
 */

const ROLES: Role[] = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'MEMBRE_SIMPLE',
  'GUIDE_RELIGIEUX',
]
const BUREAU: Role[] = ['ADMIN', 'PRESIDENT', 'SECRETAIRE']

const AUTEUR_ID = 'u-auteur'
const RESP_ID = 'u-resp'

/** Conflit de base par niveau (auteur fixe ; responsable seulement pour CONFIDENTIEL). */
const conflit = (
  niveau: ConflitAcces['niveauConfidentialite'],
  overrides: Partial<ConflitAcces> = {},
): ConflitAcces => ({
  niveauConfidentialite: niveau,
  auteurId: AUTEUR_ID,
  responsableSuiviId: niveau === 'CONFIDENTIEL' ? RESP_ID : null,
  ...overrides,
})

/** Un demandeur « étranger » (ni auteur ni responsable) avec le rôle donné. */
const etranger = (role: Role): DemandeurConflit => ({ id: `u-etranger-${role}`, role })

describe('peutVoirConflit — règle d’accès (§4.4)', () => {
  /* PUBLIC ------------------------------------------------------------------ */
  describe('PUBLIC — visible par tous les rôles SAUF GUIDE_RELIGIEUX', () => {
    for (const role of ROLES) {
      const attendu = role !== 'GUIDE_RELIGIEUX'
      it(`${role} ${attendu ? 'voit' : 'NE voit PAS'} un conflit PUBLIC`, () => {
        expect(peutVoirConflit(conflit('PUBLIC'), etranger(role))).toBe(attendu)
      })
    }
    it('visible même sans identité (id indéfini)', () => {
      expect(peutVoirConflit(conflit('PUBLIC'), { role: 'MEMBRE_SIMPLE' })).toBe(true)
    })
  })

  /* GUIDE_RELIGIEUX — exclu totalement ------------------------------------- */
  describe('GUIDE_RELIGIEUX — exclu de TOUT le module (convention projet)', () => {
    it('ne voit aucun niveau, même en étant désigné auteur/responsable', () => {
      expect(peutVoirConflit(conflit('PUBLIC'), etranger('GUIDE_RELIGIEUX'))).toBe(false)
      expect(peutVoirConflit(conflit('BUREAU'), etranger('GUIDE_RELIGIEUX'))).toBe(false)
      // Même auteur d'un CONFIDENTIEL (cas théorique), GUIDE reste exclu.
      expect(
        peutVoirConflit(conflit('CONFIDENTIEL', { auteurId: 'u-g' }), { id: 'u-g', role: 'GUIDE_RELIGIEUX' }),
      ).toBe(false)
    })
  })

  /* BUREAU ------------------------------------------------------------------ */
  describe('BUREAU — visible par le bureau exécutif uniquement', () => {
    for (const role of ROLES) {
      const attendu = BUREAU.includes(role)
      it(`${role} ${attendu ? 'voit' : 'NE voit PAS'} un conflit BUREAU`, () => {
        expect(peutVoirConflit(conflit('BUREAU'), etranger(role))).toBe(attendu)
      })
    }
    it('l’identité n’intervient pas (auteur MEMBRE_SIMPLE d’un BUREAU le voit via… non : reste role-based)', () => {
      // Un MEMBRE_SIMPLE, même s’il était auteur, n’a pas de droit BUREAU par le rôle.
      // (En pratique un MEMBRE_SIMPLE ne peut pas déclarer ; test de robustesse de la règle.)
      expect(
        peutVoirConflit(conflit('BUREAU', { auteurId: 'u-x' }), { id: 'u-x', role: 'MEMBRE_SIMPLE' }),
      ).toBe(false)
    })
  })

  /* CONFIDENTIEL ------------------------------------------------------------ */
  describe('CONFIDENTIEL — auteur, responsable de suivi, ADMIN uniquement', () => {
    it('l’auteur le voit (quel que soit son rôle)', () => {
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), { id: AUTEUR_ID, role: 'MEMBRE_SIMPLE' })).toBe(true)
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), { id: AUTEUR_ID, role: 'PRESIDENT' })).toBe(true)
    })
    it('le responsable de suivi le voit (quel que soit son rôle)', () => {
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), { id: RESP_ID, role: 'COMMISSAIRE_COMPTES' })).toBe(true)
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), { id: RESP_ID, role: 'MEMBRE_SIMPLE' })).toBe(true)
    })
    it('l’ADMIN le voit même s’il n’est ni auteur ni responsable', () => {
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), { id: 'u-admin', role: 'ADMIN' })).toBe(true)
    })

    // Le point le plus sensible : PRESIDENT / SECRETAIRE ne voient PAS un CONFIDENTIEL
    // s’ils ne sont ni auteur ni responsable — le rôle bureau ne suffit pas.
    it('PRESIDENT non-partie NE voit PAS un CONFIDENTIEL', () => {
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), etranger('PRESIDENT'))).toBe(false)
    })
    it('SECRETAIRE non-partie NE voit PAS un CONFIDENTIEL', () => {
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), etranger('SECRETAIRE'))).toBe(false)
    })

    // Tous les autres rôles non-parties : refus.
    for (const role of ROLES.filter((r) => r !== 'ADMIN')) {
      it(`${role} étranger (ni auteur ni responsable) NE voit PAS un CONFIDENTIEL`, () => {
        expect(peutVoirConflit(conflit('CONFIDENTIEL'), etranger(role))).toBe(false)
      })
    }

    it('un demandeur sans identité (id indéfini) NE voit PAS un CONFIDENTIEL', () => {
      expect(peutVoirConflit(conflit('CONFIDENTIEL'), { role: 'PRESIDENT' })).toBe(false)
    })
    it('responsableSuiviId null : personne d’autre que auteur/ADMIN', () => {
      const c = conflit('CONFIDENTIEL', { responsableSuiviId: null })
      expect(peutVoirConflit(c, { id: RESP_ID, role: 'SECRETAIRE' })).toBe(false)
      expect(peutVoirConflit(c, { id: AUTEUR_ID, role: 'MEMBRE_SIMPLE' })).toBe(true)
    })
  })

  /* Défaut fermé ------------------------------------------------------------ */
  it('niveau inconnu → refus (défaut fermé), sauf ADMIN', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = { niveauConfidentialite: 'AUTRE' as any, auteurId: AUTEUR_ID, responsableSuiviId: null }
    expect(peutVoirConflit(c, etranger('PRESIDENT'))).toBe(false)
    expect(peutVoirConflit(c, { id: AUTEUR_ID, role: 'MEMBRE_SIMPLE' })).toBe(false)
    expect(peutVoirConflit(c, { id: 'x', role: 'ADMIN' })).toBe(true)
  })
})

describe('peutModifierConflit — plus strict que la lecture', () => {
  it('auteur, responsable, ADMIN peuvent modifier', () => {
    const c = conflit('CONFIDENTIEL')
    expect(peutModifierConflit(c, { id: AUTEUR_ID, role: 'MEMBRE_SIMPLE' })).toBe(true)
    expect(peutModifierConflit(c, { id: RESP_ID, role: 'TRESORIERE' })).toBe(true)
    expect(peutModifierConflit(c, { id: 'u-admin', role: 'ADMIN' })).toBe(true)
  })

  it('un membre du bureau qui PEUT VOIR un BUREAU ne peut PAS le modifier s’il n’est pas partie', () => {
    const c = conflit('BUREAU')
    // PRESIDENT non-partie : voit (rôle bureau) mais ne modifie pas.
    expect(peutVoirConflit(c, etranger('PRESIDENT'))).toBe(true)
    expect(peutModifierConflit(c, etranger('PRESIDENT'))).toBe(false)
  })

  it('un demandeur sans identité non-ADMIN ne peut pas modifier', () => {
    expect(peutModifierConflit(conflit('PUBLIC'), { role: 'PRESIDENT' })).toBe(false)
  })
})
