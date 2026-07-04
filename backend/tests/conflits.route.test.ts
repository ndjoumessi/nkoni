import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildConflitsMock } from './support/conflits-prisma-mock'

/**
 * V2 (§4.4) — Conflits : tests d'intégration. Prisma mocké.
 * Couvre : déclaration réservée au bureau, LISTE filtrée exacte par rôle (niveaux
 * mélangés), GET /:id → 403 (pas 404) si non autorisé, PATCH (auteur/responsable/ADMIN),
 * validations de création. Comptes/rôles : cf. conflits-prisma-mock (u-admin, u-pres…).
 */

describe('Conflits (§4.4)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app = await buildApp({ prisma: buildConflitsMock() as any, logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  // sub = id Utilisateur (doit correspondre aux comptes du mock pour les règles d'identité).
  const auth = (role: string, sub: string) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, role })}`,
  })

  const declarer = (payload: object, role: string, sub: string) =>
    app.inject({ method: 'POST', url: '/conflits', headers: auth(role, sub), payload })

  const base = { titre: 'Litige', description: 'Description du litige.' }

  /* Déclaration ------------------------------------------------------------- */

  it('ADMIN/PRESIDENT/SECRETAIRE peuvent déclarer (201)', async () => {
    for (const [role, sub] of [
      ['ADMIN', 'u-admin'],
      ['PRESIDENT', 'u-pres'],
      ['SECRETAIRE', 'u-sec'],
    ] as const) {
      const res = await declarer({ ...base, niveauConfidentialite: 'PUBLIC' }, role, sub)
      expect(res.statusCode, role).toBe(201)
    }
  })

  it('TRESORIERE / COMMISSAIRE / MEMBRE_SIMPLE / GUIDE ne peuvent PAS déclarer (403)', async () => {
    for (const [role, sub] of [
      ['TRESORIERE', 'u-tres'],
      ['COMMISSAIRE_COMPTES', 'u-comm'],
      ['MEMBRE_SIMPLE', 'u-membre'],
      ['GUIDE_RELIGIEUX', 'u-guide'],
    ] as const) {
      const res = await declarer({ ...base, niveauConfidentialite: 'PUBLIC' }, role, sub)
      expect(res.statusCode, role).toBe(403)
    }
  })

  /* Responsables possibles (sélecteur du formulaire) ------------------------ */

  it('GET /conflits/responsables : un déclarant obtient la liste (id/email/role, sans passwordHash)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conflits/responsables',
      headers: auth('PRESIDENT', 'u-pres'),
    })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]).toHaveProperty('email')
    expect(list[0].passwordHash).toBeUndefined()
  })

  it('GET /conflits/responsables : refusé (403) pour un non-déclarant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/conflits/responsables',
      headers: auth('MEMBRE_SIMPLE', 'u-membre'),
    })
    expect(res.statusCode).toBe(403)
  })

  /* Validations de création ------------------------------------------------- */

  it('refuse un responsable de suivi si le niveau ≠ CONFIDENTIEL (400)', async () => {
    const res = await declarer(
      { ...base, niveauConfidentialite: 'BUREAU', responsableSuiviId: 'u-comm' },
      'ADMIN',
      'u-admin',
    )
    expect(res.statusCode).toBe(400)
  })

  it('refuse un responsable de suivi inexistant (400)', async () => {
    const res = await declarer(
      { ...base, niveauConfidentialite: 'CONFIDENTIEL', responsableSuiviId: 'u-inconnu' },
      'ADMIN',
      'u-admin',
    )
    expect(res.statusCode).toBe(400)
  })

  it('refuse un membre concerné inexistant (400)', async () => {
    const res = await declarer(
      { ...base, niveauConfidentialite: 'PUBLIC', membresConcernes: ['m-1', 'm-inconnu'] },
      'ADMIN',
      'u-admin',
    )
    expect(res.statusCode).toBe(400)
  })

  it('crée un CONFIDENTIEL avec responsable + membres concernés (201)', async () => {
    const res = await declarer(
      {
        ...base,
        niveauConfidentialite: 'CONFIDENTIEL',
        responsableSuiviId: 'u-comm',
        membresConcernes: ['m-1', 'm-2'],
      },
      'PRESIDENT',
      'u-pres',
    )
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.auteur.id).toBe('u-pres')
    expect(body.responsableSuivi.id).toBe('u-comm')
    expect(body.membresConcernes.map((m: { id: string }) => m.id).sort()).toEqual(['m-1', 'm-2'])
    // Aucune fuite de passwordHash.
    expect(body.auteur.passwordHash).toBeUndefined()
  })

  /* LISTE filtrée exacte par rôle (niveaux mélangés) ------------------------ */

  describe('GET /conflits — liste filtrée par la règle d’accès', () => {
    let idPub: string
    let idBur: string
    let idConf: string

    beforeEach(async () => {
      // C_PUB (auteur SECRETAIRE), C_BUR (auteur SECRETAIRE),
      // C_CONF (auteur PRESIDENT, responsable COMMISSAIRE).
      idPub = (await declarer({ ...base, niveauConfidentialite: 'PUBLIC' }, 'SECRETAIRE', 'u-sec')).json().id
      idBur = (await declarer({ ...base, niveauConfidentialite: 'BUREAU' }, 'SECRETAIRE', 'u-sec')).json().id
      idConf = (
        await declarer(
          { ...base, niveauConfidentialite: 'CONFIDENTIEL', responsableSuiviId: 'u-comm' },
          'PRESIDENT',
          'u-pres',
        )
      ).json().id
    })

    const visiblesPour = async (role: string, sub: string): Promise<string[]> => {
      const res = await app.inject({ method: 'GET', url: '/conflits', headers: auth(role, sub) })
      expect(res.statusCode).toBe(200)
      return res.json().map((c: { id: string }) => c.id).sort()
    }

    it('ADMIN voit tout', async () => {
      expect(await visiblesPour('ADMIN', 'u-admin')).toEqual([idPub, idBur, idConf].sort())
    })
    it('MEMBRE_SIMPLE (non-partie) ne voit que le PUBLIC', async () => {
      expect(await visiblesPour('MEMBRE_SIMPLE', 'u-membre')).toEqual([idPub])
    })
    it('TRESORIERE ne voit que le PUBLIC', async () => {
      expect(await visiblesPour('TRESORIERE', 'u-tres')).toEqual([idPub])
    })
    it('GUIDE_RELIGIEUX ne voit AUCUN conflit (exclu totalement du module)', async () => {
      expect(await visiblesPour('GUIDE_RELIGIEUX', 'u-guide')).toEqual([])
    })
    it('SECRETAIRE voit PUBLIC + BUREAU, mais PAS le CONFIDENTIEL (non-partie)', async () => {
      expect(await visiblesPour('SECRETAIRE', 'u-sec')).toEqual([idPub, idBur].sort())
    })
    it('PRESIDENT (auteur du CONFIDENTIEL) voit les trois', async () => {
      expect(await visiblesPour('PRESIDENT', 'u-pres')).toEqual([idPub, idBur, idConf].sort())
    })
    it('COMMISSAIRE (responsable du CONFIDENTIEL) voit PUBLIC + CONFIDENTIEL, mais PAS BUREAU', async () => {
      expect(await visiblesPour('COMMISSAIRE_COMPTES', 'u-comm')).toEqual([idPub, idConf].sort())
    })

    /* GET /:id — 403 (pas 404) si non autorisé pour CE conflit --------------- */

    it('GET /:id CONFIDENTIEL par un non-autorisé → 404 (ne divulgue pas l’existence)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/conflits/${idConf}`,
        headers: auth('SECRETAIRE', 'u-sec'),
      })
      expect(res.statusCode).toBe(404)
    })
    it('GET /:id CONFIDENTIEL par l’auteur → 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/conflits/${idConf}`,
        headers: auth('PRESIDENT', 'u-pres'),
      })
      expect(res.statusCode).toBe(200)
    })
    it('GET /:id CONFIDENTIEL par le responsable → 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/conflits/${idConf}`,
        headers: auth('COMMISSAIRE_COMPTES', 'u-comm'),
      })
      expect(res.statusCode).toBe(200)
    })
    it('GET /:id BUREAU par TRESORIERE (non autorisé) → 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/conflits/${idBur}`,
        headers: auth('TRESORIERE', 'u-tres'),
      })
      expect(res.statusCode).toBe(404)
    })
    it('GET /:id inexistant → 404 (indiscernable d’un non autorisé)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/conflits/cf-inexistant',
        headers: auth('ADMIN', 'u-admin'),
      })
      expect(res.statusCode).toBe(404)
    })

    /* PATCH — auteur / responsable / ADMIN ; view ≠ modify ------------------ */

    it('PATCH CONFIDENTIEL par l’auteur → 200 + statut/résolution', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/conflits/${idConf}`,
        headers: auth('PRESIDENT', 'u-pres'),
        payload: { statut: 'RESOLU', notes: 'Réconciliation.' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.statut).toBe('RESOLU')
      expect(body.dateResolution).not.toBeNull() // renseignée automatiquement
      expect(body.notes).toBe('Réconciliation.')
    })
    it('PATCH CONFIDENTIEL par le responsable → 200', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/conflits/${idConf}`,
        headers: auth('COMMISSAIRE_COMPTES', 'u-comm'),
        payload: { statut: 'EN_COURS' },
      })
      expect(res.statusCode).toBe(200)
    })
    it('PATCH CONFIDENTIEL par un non-partie qui ne peut PAS le voir (SECRETAIRE) → 404', async () => {
      // SECRETAIRE non-partie ne voit pas ce CONFIDENTIEL → 404 (pas 403 : on ne divulgue pas l’existence).
      const res = await app.inject({
        method: 'PATCH',
        url: `/conflits/${idConf}`,
        headers: auth('SECRETAIRE', 'u-sec'),
        payload: { statut: 'CLOS' },
      })
      expect(res.statusCode).toBe(404)
    })
    it('PATCH BUREAU par PRESIDENT qui PEUT VOIR mais n’est pas partie → 403 (view ≠ modify)', async () => {
      // idBur a pour auteur u-sec ; u-pres voit (rôle bureau) mais n'est ni auteur ni responsable.
      const res = await app.inject({
        method: 'PATCH',
        url: `/conflits/${idBur}`,
        headers: auth('PRESIDENT', 'u-pres'),
        payload: { statut: 'EN_COURS' },
      })
      expect(res.statusCode).toBe(403)
    })
    it('PATCH par ADMIN → 200 (supervision)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/conflits/${idBur}`,
        headers: auth('ADMIN', 'u-admin'),
        payload: { statut: 'CLOS' },
      })
      expect(res.statusCode).toBe(200)
    })

    it('pas de suppression : DELETE /conflits/:id → 404 (route absente)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/conflits/${idPub}`,
        headers: auth('ADMIN', 'u-admin'),
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
