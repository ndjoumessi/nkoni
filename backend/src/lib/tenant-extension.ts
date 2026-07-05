import { Prisma } from '../generated/prisma/client'
import { orgContext } from './org-context'

/**
 * Extension Prisma d'ISOLATION multi-tenant (SaaS §2.2) — défense en profondeur : injecte
 * `organisationId` dans TOUTE opération sur un modèle scopé, à partir du contexte de requête
 * (org-context). Objectif : rendre une fuite structurellement difficile, pas juste rare.
 *
 * Comportement par opération (modèle scopé, contexte org présent) :
 *   - lectures à `where` libre (findMany/findFirst[OrThrow]/count/aggregate/groupBy) et
 *     mutations de masse (updateMany/deleteMany) → `where.organisationId` injecté.
 *   - findUnique[OrThrow] : le `where` unique n'accepte pas `organisationId` → POST-filtre
 *     (on vérifie `result.organisationId` ; sinon null / NotFound). Aucune fuite.
 *   - create/createMany → `organisationId` FORCÉ à l'org courante dans `data` (toute valeur
 *     fournie par l'appelant est IGNORÉE : impossible d'écrire dans une autre org).
 *   - update/delete/upsert (par `where` unique) → PRÉ-lecture de la cible (client `base`,
 *     non scopé). Si elle appartient à une autre org OU est absente → lève **P2025**
 *     (introuvable) : indistinguable d'un id inexistant, donc pas de fuite d'existence, et
 *     compatible avec la gestion P2025 → 404 des routes. Sur une cible valide (même org),
 *     `organisationId` est aussi FORCÉ dans les `data` (pas de déplacement cross-org via
 *     `update { data: { organisationId: … } }`). NB : `upsert` d'une cible absente = création.
 *   - updateMany/deleteMany → `where.organisationId` injecté ; updateMany force aussi `data`.
 *
 * FAIL-CLOSED : sur un modèle scopé, si le contexte n'a ni `organisationId` ni `unscoped`,
 * la requête LÈVE `TenantContextError` (jamais « tout retourner »). `unscoped: true` bypass
 * délibéré (login/refresh/système/seed/super-admin).
 *
 * M2M (Conflit/Commémoration ↔ Membre) : les tables de jointure sont EXPLICITES et scopées
 * (ConflitMembreConcerne / CommemorationMembreConcerne, chacune avec `organisationId`). Les
 * liens sont créés/supprimés via des opérations TOP-LEVEL scopées (createMany/deleteMany),
 * jamais via un M2M implicite. Conséquence : un lien ne peut naître que dans l'org courante,
 * et il référence un membre déjà validé dans cette org → même une lecture imbriquée
 * (`conflit.findMany({ include: { membresConcernes } })`) ne peut structurellement pas
 * exposer un membre d'une autre org.
 *
 * LIMITES ASSUMÉES (documentées) :
 *   - Les lectures IMBRIQUÉES via include/select ne sont pas RE-filtrées par l'extension
 *     (Prisma n'expose que l'opération de plus haut niveau) ; l'isolation repose sur
 *     l'intégrité des données garantie par les écritures scopées ci-dessus.
 *   - Opérations non couvertes ici : `createManyAndReturn`, écritures imbriquées profondes
 *     (on écrit donc les liens M2M via des opérations top-level, cf. services conflit/commémo).
 */

/**
 * Type d'entrée de CRÉATION d'un modèle scopé, SANS `organisationId`/`organisation` :
 * l'extension d'isolation injecte l'organisation courante au runtime (fail-closed sinon), donc
 * les services/routes n'ont pas à la fournir. `organisationId` étant NOT NULL (Phase B), les
 * types Prisma l'exigeraient sinon ; ce helper documente que l'injection est déléguée.
 */
export type CreationScopee<T> = Omit<T, 'organisationId' | 'organisation'>

/** Les 22 modèles métier scopés par organisation (tous portent `organisationId`).
 *  Inclut les 2 tables de jointure M2M explicites (Conflit/Commémoration ↔ Membre) :
 *  leurs liens sont créés/lus via des opérations scopées, pas via un M2M implicite. */
export const SCOPED_MODELS = new Set<string>([
  'Utilisateur',
  'BrancheFamiliale',
  'Membre',
  'BaremeAnnuel',
  'Contribution',
  'Versement',
  'EquilibrageContribution',
  'EquilibrageDetail',
  'Recu',
  'Reunion',
  'PointOrdreDuJour',
  'Resolution',
  'FonctionFamiliale',
  'AffectationFonction',
  'EvenementFamilial',
  'Conflit',
  'ConflitMembreConcerne',
  'Commemoration',
  'CommemorationMembreConcerne',
  'Document',
  'AuditLog',
  'Notification',
])

/** Levée quand une requête scopée n'a pas de contexte org valide, ou vise une autre org. */
export class TenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(`Isolation multi-tenant : opération '${operation}' sur '${model}' hors contexte d'organisation.`)
    this.name = 'TenantContextError'
  }
}

const READ_WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
])
const UNIQUE_READ_OPS = new Set(['findUnique', 'findUniqueOrThrow'])
const MUT_UNIQUE_OPS = new Set(['update', 'delete', 'upsert'])

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 'Membre' → 'membre' (accès camelCase du client). */
function accessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

/**
 * Cœur interceptable (testable). `base` = client NON scopé, utilisé pour la pré-lecture des
 * cibles d'update/delete/upsert (vérification d'appartenance).
 */
export async function intercepterTenant(
  base: any,
  ctx: { model: string | undefined; operation: string; args: any; query: (args: any) => Promise<any> },
): Promise<any> {
  const { model, operation, args, query } = ctx
  if (!model || !SCOPED_MODELS.has(model)) return query(args)

  const store = orgContext.current()
  if (store?.unscoped) return query(args) // bypass délibéré
  const orgId = store?.organisationId
  if (!orgId) throw new TenantContextError(model, operation) // FAIL-CLOSED

  // Lectures à where libre + mutations de masse : filtre injecté (organisationId placé EN
  // DERNIER → écrase toute valeur fournie par l'appelant, pas de contournement possible).
  if (READ_WHERE_OPS.has(operation)) {
    const scoped: any = { ...args, where: { ...args?.where, organisationId: orgId } }
    // updateMany : FORCER aussi organisationId dans data (empêche de déplacer en masse des
    // lignes vers une autre org). deleteMany / lectures n'ont pas de `data`.
    if (operation === 'updateMany') scoped.data = { ...args?.data, organisationId: orgId }
    return query(scoped)
  }

  // findUnique[OrThrow] : post-filtre (le where unique ne tolère pas organisationId).
  if (UNIQUE_READ_OPS.has(operation)) {
    const res = await query(args)
    if (res && res.organisationId === orgId) return res
    if (operation === 'findUniqueOrThrow') {
      throw new Prisma.PrismaClientKnownRequestError('No record found', {
        code: 'P2025',
        clientVersion: 'nkoni-tenant',
      })
    }
    return null
  }

  // create : FORCER organisationId = orgId (on IGNORE toute valeur fournie par l'appelant,
  // sinon un create avec organisationId d'une AUTRE org écrirait cross-tenant).
  if (operation === 'create') {
    return query({ ...args, data: { ...args?.data, organisationId: orgId } })
  }
  if (operation === 'createMany') {
    const raw = args?.data
    const data = Array.isArray(raw)
      ? raw.map((d: any) => ({ ...d, organisationId: orgId }))
      : { ...raw, organisationId: orgId }
    return query({ ...args, data })
  }

  // update / delete / upsert par where unique : pré-lecture + garde d'appartenance.
  if (MUT_UNIQUE_OPS.has(operation)) {
    const existing = await base[accessor(model)]
      .findUnique({ where: args.where })
      .catch(() => null)

    if (existing && existing.organisationId === orgId) {
      // Cible dans l'org courante. On FORCE organisationId dans les data d'écriture pour
      // interdire un déplacement cross-org (ex. update { data: { organisationId: autre } }).
      if (operation === 'delete') return query(args) // pas de data
      if (operation === 'update') {
        return query({ ...args, data: { ...args?.data, organisationId: orgId } })
      }
      // upsert d'une cible existante (même org) : forcer org dans create ET update.
      return query({
        ...args,
        create: { ...args?.create, organisationId: orgId },
        update: { ...args?.update, organisationId: orgId },
      })
    }
    if (operation === 'upsert' && !existing) {
      // upsert d'une cible inexistante = création → forcer org dans `create` (et `update`).
      return query({
        ...args,
        create: { ...args?.create, organisationId: orgId },
        update: { ...args?.update, organisationId: orgId },
      })
    }
    // Cible absente OU appartenant à une autre org → INDISTINGUABLE d'un « introuvable ».
    // On lève P2025 (et NON TenantContextError, réservé à l'absence TOTALE de contexte =
    // erreur de câblage) : pas de fuite d'existence cross-org, et compatible avec la gestion
    // P2025 → 404 déjà en place dans les routes (une mutation par id d'une autre org se
    // comporte exactement comme une mutation d'un id inexistant dans l'org courante).
    throw new Prisma.PrismaClientKnownRequestError('No record was found for a mutation.', {
      code: 'P2025',
      clientVersion: 'nkoni-tenant',
    })
  }

  return query(args)
}

/** Extension à chaîner via `prisma.$extends(tenantExtension(base))`. */
export function tenantExtension(base: any) {
  return Prisma.defineExtension({
    name: 'nkoni-tenant',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }: any) {
          return intercepterTenant(base, { model, operation, args, query })
        },
      },
    },
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
