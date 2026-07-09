import { describe, it, expect, vi } from 'vitest'
import { intercepterTenant, TenantContextError } from '../src/lib/tenant-extension'
import { orgContext, type OrgStore } from '../src/lib/org-context'
import {
  chargerParent,
  getDocumentPourTelechargement,
  supprimerDocument,
  DocumentIntrouvableError,
  type DemandeurDocument,
} from '../src/services/document.service'

/**
 * RÉGRESSION SÉCURITÉ — post-filtre `findUnique[OrThrow]` de l'extension d'isolation tenant.
 *
 * BUG corrigé (fix/tenant-findunique-select) : le post-filtre vérifie `res.organisationId === orgId`.
 * Si l'appelant passait un `select` OMETTANT organisationId, le champ était absent du résultat, la
 * comparaison échouait TOUJOURS (`undefined !== orgId`) et TOUTE ligne — même la sienne — était jugée
 * « introuvable ». ~10 sites (documents, statut membre, notifications, reçus, résolutions, dashboard…)
 * étaient cassés. Le fix ajoute organisationId au select le temps de la requête PUIS le retire du
 * résultat rendu.
 *
 * Ces tests prouvent :
 *   - le cas cassé est réparé (select tronqué → la ligne de l'org courante est bien retournée) ;
 *   - AUCUNE régression d'isolation : un select scopé ne retourne JAMAIS une ligne d'une autre org ;
 *   - organisationId n'est JAMAIS exposé à l'appelant s'il ne l'a pas demandé dans son select ;
 *   - un test par site réellement impacté.
 *
 * Pas de DB : on teste le CŒUR interceptable `intercepterTenant` (comme la prod le câble via
 * `$allOperations`) avec une `query` en aval qui SIMULE Prisma — recherche par la clé unique de
 * `where`, puis PROJETTE sur `args.select` (organisationId inclus s'il y figure, car l'extension l'y
 * injecte). C'est fidèle : `findUnique` ne filtre PAS par org — le post-filtre de l'extension le fait.
 */

const ORG_A = 'org-A'
const ORG_B = 'org-B'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Simule Prisma en aval : projette la ligne trouvée sur les champs de `args.select`. */
function fetchProject(rows: Record<string, unknown>[], args: any): Promise<unknown> {
  const [k, v] = Object.entries(args.where)[0] as [string, unknown]
  const row = rows.find((r) => r[k] === v)
  if (!row) return Promise.resolve(null)
  if (!args.select) return Promise.resolve({ ...row }) // findUnique sans select → ligne complète
  const projete: Record<string, unknown> = {}
  for (const cle of Object.keys(args.select)) if (args.select[cle]) projete[cle] = row[cle]
  return Promise.resolve(projete)
}

/** Exécute un findUnique[OrThrow] scopé via l'extension RÉELLE, sur un jeu de lignes en mémoire. */
function findUniqueScopé(
  model: string,
  rows: Record<string, unknown>[],
  store: OrgStore,
  args: any,
  operation: 'findUnique' | 'findUniqueOrThrow' = 'findUnique',
): Promise<any> {
  return orgContext.run(store, () =>
    intercepterTenant({}, { model, operation, args, query: (a: any) => fetchProject(rows, a) }),
  )
}

/* -------------------------------------------------------------------------- */
/* Couche A — cœur du post-filtre (exhaustif)                                 */
/* -------------------------------------------------------------------------- */

describe('Extension tenant — post-filtre findUnique avec select tronqué', () => {
  const membre = { id: 'm1', compteUtilisateurId: null, organisationId: ORG_A }
  const selectTronque = { where: { id: 'm1' }, select: { id: true, compteUtilisateurId: true } }

  it('CAS RÉPARÉ : select omettant organisationId, org courante → la ligne est retournée', async () => {
    const res = await findUniqueScopé('Membre', [membre], { organisationId: ORG_A }, selectTronque)
    expect(res).toEqual({ id: 'm1', compteUtilisateurId: null })
  })

  it('NON-EXPOSITION : organisationId absent du résultat s’il n’était pas demandé', async () => {
    const res = await findUniqueScopé('Membre', [membre], { organisationId: ORG_A }, selectTronque)
    expect(res).not.toBeNull()
    expect('organisationId' in res).toBe(false)
  })

  it('ISOLATION : ligne d’une AUTRE org → null (même avec select tronqué)', async () => {
    const autre = { id: 'm1', compteUtilisateurId: null, organisationId: ORG_B }
    const res = await findUniqueScopé('Membre', [autre], { organisationId: ORG_A }, selectTronque)
    expect(res).toBeNull()
  })

  it('ISOLATION findUniqueOrThrow : ligne d’une autre org → lève P2025', async () => {
    const autre = { id: 'm1', compteUtilisateurId: null, organisationId: ORG_B }
    await expect(
      findUniqueScopé('Membre', [autre], { organisationId: ORG_A }, selectTronque, 'findUniqueOrThrow'),
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  it('findUniqueOrThrow, org courante, select tronqué → la ligne est retournée', async () => {
    const res = await findUniqueScopé(
      'Membre', [membre], { organisationId: ORG_A }, selectTronque, 'findUniqueOrThrow',
    )
    expect(res).toEqual({ id: 'm1', compteUtilisateurId: null })
  })

  it('organisationId EXPLICITEMENT demandé dans le select → conservé dans le résultat', async () => {
    const res = await findUniqueScopé('Membre', [membre], { organisationId: ORG_A }, {
      where: { id: 'm1' },
      select: { id: true, organisationId: true },
    })
    expect(res).toEqual({ id: 'm1', organisationId: ORG_A })
  })

  it('sans select (findUnique complet) → inchangé, ligne complète avec organisationId', async () => {
    const res = await findUniqueScopé('Membre', [membre], { organisationId: ORG_A }, { where: { id: 'm1' } })
    expect(res).toEqual(membre)
    expect(res.organisationId).toBe(ORG_A)
  })

  it('include (pas de select) → inchangé, organisationId présent (non retiré)', async () => {
    const avecRelation = { ...membre, organisation: { devise: 'FCFA' } }
    const res = await findUniqueScopé('Membre', [avecRelation], { organisationId: ORG_A }, {
      where: { id: 'm1' },
      include: { organisation: true },
    })
    expect(res.organisationId).toBe(ORG_A)
    expect(res.organisation).toEqual({ devise: 'FCFA' })
  })

  it('select avec RELATION imbriquée sans organisationId scalaire → relation intacte, orgId retiré', async () => {
    const avecRelation = { ...membre, organisation: { devise: 'FCFA' } }
    const res = await findUniqueScopé('Membre', [avecRelation], { organisationId: ORG_A }, {
      where: { id: 'm1' },
      select: { organisation: { select: { devise: true } } },
    })
    expect(res).toEqual({ organisation: { devise: 'FCFA' } })
    expect('organisationId' in res).toBe(false)
  })

  it('ligne inexistante → null (findUnique) / P2025 (findUniqueOrThrow)', async () => {
    expect(await findUniqueScopé('Membre', [], { organisationId: ORG_A }, selectTronque)).toBeNull()
    await expect(
      findUniqueScopé('Membre', [], { organisationId: ORG_A }, selectTronque, 'findUniqueOrThrow'),
    ).rejects.toMatchObject({ code: 'P2025' })
  })

  it('FAIL-CLOSED inchangé : modèle scopé sans contexte org (ni id ni unscoped) → TenantContextError', async () => {
    await expect(
      findUniqueScopé('Membre', [membre], {}, selectTronque),
    ).rejects.toBeInstanceOf(TenantContextError)
  })

  it('bypass unscoped inchangé : select tronqué renvoie la ligne sans post-filtre', async () => {
    const res = await findUniqueScopé('Membre', [membre], { unscoped: true }, selectTronque)
    expect(res).toEqual({ id: 'm1', compteUtilisateurId: null })
  })

  it('modèle NON scopé (Organisation) → aucun post-filtre, select respecté tel quel', async () => {
    const org = { id: 'o1', nom: 'Alpha' } // pas d'organisationId (Organisation n'est pas scopée)
    const res = await findUniqueScopé('Organisation', [org], { organisationId: ORG_A }, {
      where: { id: 'o1' },
      select: { nom: true },
    })
    expect(res).toEqual({ nom: 'Alpha' })
  })
})

/* -------------------------------------------------------------------------- */
/* Couche B — un test par SITE réellement impacté                             */
/* -------------------------------------------------------------------------- */

/**
 * Chaque entrée reproduit le `select` EXACT émis par le site (miroir de la source). Le test prouve,
 * via l'extension réelle : (1) org courante → la ligne est retournée avec les champs demandés et
 * SANS organisationId ; (2) autre org → null (isolation). Avant le fix, (1) renvoyait null → le site
 * était cassé.
 */
const SITES: { site: string; model: string; where: Record<string, unknown>; select: Record<string, true> }[] = [
  { site: 'Documents upload — parent MEMBRE (chargerParent)', model: 'Membre',
    where: { id: 'x' }, select: { id: true, compteUtilisateurId: true } },
  { site: 'Documents upload — parent CONFLIT (chargerParent)', model: 'Conflit',
    where: { id: 'x' }, select: { niveauConfidentialite: true, auteurId: true, responsableSuiviId: true } },
  { site: 'Documents upload — parent REUNION (chargerParent)', model: 'Reunion',
    where: { id: 'x' }, select: { id: true } },
  { site: 'Documents upload — parent COMMEMORATION (chargerParent)', model: 'Commemoration',
    where: { id: 'x' }, select: { id: true } },
  { site: 'Documents téléchargement (getDocumentPourTelechargement)', model: 'Document',
    where: { id: 'x' }, select: { url: true, typeFichier: true, nom: true, entiteType: true, entiteId: true } },
  { site: 'Documents suppression (supprimerDocument)', model: 'Document',
    where: { id: 'x' }, select: { url: true, entiteType: true, entiteId: true } },
  { site: 'GET /membres/:id/statut (contributions.route)', model: 'Membre',
    where: { id: 'x' }, select: { id: true, anneeAdhesion: true, anneeFinContribution: true, compteUtilisateurId: true } },
  { site: 'notifierVersement — résolution du destinataire', model: 'Membre',
    where: { id: 'x' }, select: { compteUtilisateurId: true } },
  { site: 'Liaison membre-compte (verifierMembreLiable)', model: 'Membre',
    where: { id: 'x' }, select: { id: true, compteUtilisateurId: true } },
  { site: 'Génération reçu — versement (tx)', model: 'Versement',
    where: { id: 'x' }, select: { id: true } },
  { site: 'Création résolution — réunion (verifierReunion)', model: 'Reunion',
    where: { id: 'x' }, select: { id: true } },
  { site: 'Création résolution — point (verifierPointDansReunion)', model: 'PointOrdreDuJour',
    where: { id: 'x' }, select: { id: true, reunionId: true } },
  { site: 'Dashboard membre (MEMBRE_SIMPLE)', model: 'Membre',
    where: { compteUtilisateurId: 'u1' }, select: { id: true } },
]

describe('Sites impactés — le select tronqué est désormais résolu (org courante) et isolé (autre org)', () => {
  for (const { site, model, where, select } of SITES) {
    it(site, async () => {
      // Ligne complète : la clé de `where`, chaque champ du select, + organisationId.
      const row: Record<string, unknown> = { organisationId: ORG_A }
      for (const [k, v] of Object.entries(where)) row[k] = v
      for (const champ of Object.keys(select)) if (!(champ in row)) row[champ] = `val:${champ}`
      const args = { where, select }

      // (1) Org courante → ligne retournée, champs demandés présents, organisationId ABSENT.
      const res = await findUniqueScopé(model, [row], { organisationId: ORG_A }, args)
      expect(res, `${site} : la ligne de l'org courante doit être retournée`).not.toBeNull()
      for (const champ of Object.keys(select)) expect(champ in res).toBe(true)
      expect('organisationId' in res, `${site} : organisationId ne doit pas fuiter`).toBe(false)

      // (2) Autre org → null (isolation stricte).
      const rowAutre = { ...row, organisationId: ORG_B }
      const isole = await findUniqueScopé(model, [rowAutre], { organisationId: ORG_A }, args)
      expect(isole, `${site} : une ligne d'une autre org ne doit jamais être retournée`).toBeNull()
    })
  }
})

/* -------------------------------------------------------------------------- */
/* Couche B bis — fonctions documents appelées POUR DE VRAI (bug signalé)     */
/* -------------------------------------------------------------------------- */

/** Fabrique un `findUnique` scopé (via l'extension) pour un modèle adossé à des lignes mémoire. */
function findUniqueDe(model: string, rows: Record<string, unknown>[]) {
  return (args: any) =>
    intercepterTenant({}, { model, operation: 'findUnique', args, query: (a: any) => fetchProject(rows, a) })
}

const ADMIN: DemandeurDocument = { id: 'admin-1', role: 'ADMIN' }

describe('Module Documents — fonctions réelles à travers l’extension (org courante vs autre org)', () => {
  it('chargerParent(MEMBRE) : org courante → parent trouvé ; autre org → null', async () => {
    const membreA = [{ id: 'm1', compteUtilisateurId: 'u9', organisationId: ORG_A }]
    const prismaA: any = { membre: { findUnique: findUniqueDe('Membre', membreA) } }

    const parent = await orgContext.run({ organisationId: ORG_A }, () =>
      chargerParent(prismaA, 'MEMBRE', 'm1'),
    )
    expect(parent).toEqual({ entiteType: 'MEMBRE', membre: { id: 'm1', compteUtilisateurId: 'u9' } })

    const membreB = [{ id: 'm1', compteUtilisateurId: 'u9', organisationId: ORG_B }]
    const prismaB: any = { membre: { findUnique: findUniqueDe('Membre', membreB) } }
    const nul = await orgContext.run({ organisationId: ORG_A }, () => chargerParent(prismaB, 'MEMBRE', 'm1'))
    expect(nul).toBeNull()
  })

  it('getDocumentPourTelechargement : org courante → URL blob ; autre org → DocumentIntrouvable', async () => {
    const doc = { id: 'd1', url: 'https://blob/x', typeFichier: 'application/pdf', nom: 'acte.pdf',
      entiteType: 'MEMBRE', entiteId: 'm1', organisationId: ORG_A }
    const membre = { id: 'm1', compteUtilisateurId: null, organisationId: ORG_A }
    const prisma: any = {
      document: { findUnique: findUniqueDe('Document', [doc]) },
      membre: { findUnique: findUniqueDe('Membre', [membre]) },
    }
    const ok = await orgContext.run({ organisationId: ORG_A }, () =>
      getDocumentPourTelechargement(prisma, 'd1', ADMIN),
    )
    expect(ok).toEqual({ url: 'https://blob/x', typeFichier: 'application/pdf', nom: 'acte.pdf' })

    // Même document mais rattaché à ORG_B : depuis ORG_A, il est « introuvable » (pas de fuite).
    const docB = { ...doc, organisationId: ORG_B }
    const membreB = { ...membre, organisationId: ORG_B }
    const prismaB: any = {
      document: { findUnique: findUniqueDe('Document', [docB]) },
      membre: { findUnique: findUniqueDe('Membre', [membreB]) },
    }
    await expect(
      orgContext.run({ organisationId: ORG_A }, () => getDocumentPourTelechargement(prismaB, 'd1', ADMIN)),
    ).rejects.toBeInstanceOf(DocumentIntrouvableError)
  })

  it('supprimerDocument (ADMIN) : org courante → blob+DB purgés ; autre org → DocumentIntrouvable', async () => {
    const doc = { id: 'd1', url: 'https://blob/x', entiteType: 'MEMBRE', entiteId: 'm1', organisationId: ORG_A }
    const blob = { del: vi.fn(async () => {}), put: vi.fn() }
    const supprime = vi.fn(async () => {})
    const prisma: any = {
      document: { findUnique: findUniqueDe('Document', [doc]), delete: supprime },
    }
    await orgContext.run({ organisationId: ORG_A }, () => supprimerDocument(prisma, blob as any, 'd1', ADMIN))
    expect(blob.del).toHaveBeenCalledWith('https://blob/x')
    expect(supprime).toHaveBeenCalledWith({ where: { id: 'd1' } })

    // Document d'une autre org : introuvable depuis ORG_A → aucune suppression (ni blob ni DB).
    const docB = { ...doc, organisationId: ORG_B }
    const blob2 = { del: vi.fn(async () => {}), put: vi.fn() }
    const supprime2 = vi.fn(async () => {})
    const prismaB: any = {
      document: { findUnique: findUniqueDe('Document', [docB]), delete: supprime2 },
    }
    await expect(
      orgContext.run({ organisationId: ORG_A }, () => supprimerDocument(prismaB, blob2 as any, 'd1', ADMIN)),
    ).rejects.toBeInstanceOf(DocumentIntrouvableError)
    expect(blob2.del).not.toHaveBeenCalled()
    expect(supprime2).not.toHaveBeenCalled()
  })
})

/* eslint-enable @typescript-eslint/no-explicit-any */
