import { describe, it, expect } from 'vitest'
import { Prisma } from '../src/generated/prisma/client'
import {
  filtrerDonnees,
  doitAuditer,
  intercepterAudit,
  MODELES_AUDITES,
} from '../src/lib/audit-middleware'
import { auditContext } from '../src/lib/audit-context'
import { orgContext } from '../src/lib/org-context'

/* Client Prisma « de base » mocké : trace auditLog.create, renvoie `before` en findUnique. */
function mockBase(before: unknown = null) {
  const audits: any[] = []
  const base: any = {
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data)
        return { id: 'audit-1', ...data }
      },
    },
  }
  const accessors = [
    'membre',
    'contribution',
    'versement',
    'equilibrageContribution',
    'utilisateur',
    'conflit',
    'depense',
    'brancheFamiliale',
  ]
  for (const a of accessors) base[a] = { findUnique: async () => before }
  return { base, audits }
}

/* Exécute une interception dans un contexte d'acteur donné. */
function intercepterAvecActeur(
  base: any,
  acteurId: string | undefined,
  ctx: { model: string; operation: string; args: any; result: unknown },
) {
  return auditContext.run({ ...(acteurId ? { acteurId } : {}) }, () =>
    intercepterAudit(base, {
      model: ctx.model,
      operation: ctx.operation,
      args: ctx.args,
      query: async () => ctx.result,
    }),
  )
}

describe('filtrerDonnees — filtrage des snapshots', () => {
  it('null/undefined → null', () => {
    expect(filtrerDonnees('Membre', null)).toBeNull()
    expect(filtrerDonnees('Membre', undefined)).toBeNull()
  })
  it('Utilisateur : retire passwordHash', () => {
    const out = filtrerDonnees('Utilisateur', { id: 'u1', email: 'a@b.c', passwordHash: 'SECRET', role: 'ADMIN' })
    expect(out).toMatchObject({ id: 'u1', email: 'a@b.c', role: 'ADMIN' })
    expect(out?.['passwordHash']).toBeUndefined()
  })
  it('Conflit : conserve UNIQUEMENT les métadonnées non sensibles', () => {
    const out = filtrerDonnees('Conflit', {
      id: 'c1',
      niveauConfidentialite: 'CONFIDENTIEL',
      statut: 'OUVERT',
      auteurId: 'u-a',
      responsableSuiviId: 'u-r',
      titre: 'TITRE_SECRET',
      description: 'DESCRIPTION_SECRETE',
      notes: 'NOTES_SECRETES',
    })
    expect(out).toEqual({
      id: 'c1',
      niveauConfidentialite: 'CONFIDENTIEL',
      statut: 'OUVERT',
      auteurId: 'u-a',
      responsableSuiviId: 'u-r',
    })
    expect(JSON.stringify(out)).not.toContain('SECRET')
  })
  it('autres modèles : copie transparente', () => {
    expect(filtrerDonnees('Membre', { id: 'm1', nom: 'X' })).toEqual({ id: 'm1', nom: 'X' })
  })
})

describe('doitAuditer — périmètre', () => {
  it('audite create/update/delete sur les 7 entités', () => {
    for (const m of MODELES_AUDITES)
      for (const op of ['create', 'update', 'delete']) expect(doitAuditer(m, op), `${m}/${op}`).toBe(true)
  })
  it('n’audite PAS les autres opérations ni les entités hors périmètre', () => {
    expect(doitAuditer('Membre', 'findMany')).toBe(false)
    expect(doitAuditer('Membre', 'updateMany')).toBe(false)
    expect(doitAuditer('BrancheFamiliale', 'update')).toBe(false)
    expect(doitAuditer('Recu', 'create')).toBe(false)
    expect(doitAuditer(undefined, 'create')).toBe(false)
  })
})

describe('intercepterAudit — capture create/update/delete', () => {
  it('chacune des 7 entités crée une entrée avec les bons avant/après', async () => {
    for (const model of MODELES_AUDITES) {
      // CREATE
      {
        const { base, audits } = mockBase(null)
        await intercepterAvecActeur(base, 'u-1', {
          model,
          operation: 'create',
          args: { data: {} },
          result: { id: `${model}-1`, valeur: 1 },
        })
        expect(audits, `${model} create`).toHaveLength(1)
        expect(audits[0]).toMatchObject({ entiteType: model, entiteId: `${model}-1`, action: 'CREATE', acteurId: 'u-1' })
        expect(audits[0].donneesAvant).toBe(Prisma.JsonNull)
      }
      // UPDATE
      {
        const before = { id: `${model}-1`, valeur: 1 }
        const { base, audits } = mockBase(before)
        await intercepterAvecActeur(base, 'u-2', {
          model,
          operation: 'update',
          args: { where: { id: `${model}-1` } },
          result: { id: `${model}-1`, valeur: 2 },
        })
        expect(audits, `${model} update`).toHaveLength(1)
        expect(audits[0]).toMatchObject({ entiteType: model, action: 'UPDATE', acteurId: 'u-2' })
        // `valeur` n'est conservé que pour les modèles à snapshot complet (Conflit = métadonnées).
        if (model !== 'Conflit') {
          expect((audits[0].donneesAvant as any).valeur).toBe(1)
          expect((audits[0].donneesApres as any).valeur).toBe(2)
        }
      }
      // DELETE
      {
        const before = { id: `${model}-1`, valeur: 9 }
        const { base, audits } = mockBase(before)
        await intercepterAvecActeur(base, 'u-3', {
          model,
          operation: 'delete',
          args: { where: { id: `${model}-1` } },
          result: before,
        })
        expect(audits, `${model} delete`).toHaveLength(1)
        expect(audits[0]).toMatchObject({ entiteType: model, action: 'DELETE' })
        expect(audits[0].donneesApres).toBe(Prisma.JsonNull)
        if (model !== 'Conflit') expect((audits[0].donneesAvant as any).valeur).toBe(9)
      }
    }
  })

  it('entité HORS périmètre (BrancheFamiliale) → AUCUNE entrée, opération exécutée', async () => {
    const { base, audits } = mockBase({ id: 'b1' })
    let executee = false
    const res = await intercepterAudit(base, {
      model: 'BrancheFamiliale',
      operation: 'update',
      args: { where: { id: 'b1' } },
      query: async () => {
        executee = true
        return { id: 'b1', nom: 'Y' }
      },
    })
    expect(executee).toBe(true)
    expect(res).toMatchObject({ id: 'b1' })
    expect(audits).toHaveLength(0)
  })

  it('SÉCURITÉ : passwordHash n’apparaît JAMAIS dans un snapshot Utilisateur', async () => {
    const before = { id: 'u1', email: 'a@b.c', passwordHash: 'HASH_AVANT', role: 'ADMIN' }
    const after = { id: 'u1', email: 'a@b.c', passwordHash: 'HASH_APRES', role: 'ADMIN' }
    const { base, audits } = mockBase(before)
    await intercepterAvecActeur(base, 'u-1', {
      model: 'Utilisateur',
      operation: 'update',
      args: { where: { id: 'u1' } },
      result: after,
    })
    const brut = JSON.stringify(audits[0])
    expect(brut).not.toContain('HASH_AVANT')
    expect(brut).not.toContain('HASH_APRES')
    expect((audits[0].donneesAvant as any).passwordHash).toBeUndefined()
    expect((audits[0].donneesApres as any).passwordHash).toBeUndefined()
  })

  it('SÉCURITÉ : le texte d’un Conflit (titre/description/notes) n’est pas stocké', async () => {
    const { base, audits } = mockBase(null)
    await intercepterAvecActeur(base, 'u-1', {
      model: 'Conflit',
      operation: 'create',
      args: { data: {} },
      result: {
        id: 'c1',
        niveauConfidentialite: 'CONFIDENTIEL',
        statut: 'OUVERT',
        auteurId: 'u-a',
        responsableSuiviId: null,
        titre: 'LITIGE_SECRET',
        description: 'DETAILS_SECRETS',
      },
    })
    expect(JSON.stringify(audits[0])).not.toContain('SECRET')
    expect((audits[0].donneesApres as any).titre).toBeUndefined()
    expect((audits[0].donneesApres as any).niveauConfidentialite).toBe('CONFIDENTIEL')
  })

  it('acteur absent (écriture système) → acteurId null', async () => {
    const { base, audits } = mockBase(null)
    await intercepterAvecActeur(base, undefined, {
      model: 'Membre',
      operation: 'create',
      args: { data: {} },
      result: { id: 'm1' },
    })
    expect(audits[0].acteurId).toBeNull()
  })

  it('flux non scopé (runUnscoped : bootstrap SUPER_ADMIN / système) → AUCUN audit écrit', async () => {
    const { base, audits } = mockBase(null)
    // L'audit étant par organisation (AuditLog.organisationId NOT NULL), une écriture
    // délibérément non scopée ne doit PAS tenter de journal orphelin — mais l'opération
    // métier, elle, doit bien s'exécuter et renvoyer son résultat.
    const result = await orgContext.runUnscoped(async () =>
      intercepterAudit(base, {
        model: 'Utilisateur',
        operation: 'create',
        args: { data: { email: 'sa@nkoni.io', role: 'SUPER_ADMIN' } },
        query: async () => ({ id: 'sa-1', email: 'sa@nkoni.io', role: 'SUPER_ADMIN' }),
      }),
    )
    expect(audits).toHaveLength(0) // aucun audit
    expect(result).toMatchObject({ id: 'sa-1', role: 'SUPER_ADMIN' }) // opération exécutée
  })
})
