import { Prisma } from '../generated/prisma/client'
import { auditContext } from './audit-context'
import { orgContext } from './org-context'

/**
 * V2 (§5) — Audit trail transverse via extension Prisma ($extends, Prisma 7 ; `$use` est
 * déprécié). Intercepte create/update/delete sur 6 entités et écrit une entrée AuditLog,
 * SANS instrumenter les services.
 *
 * Snapshots avant/après filtrés :
 *   - Utilisateur : `passwordHash` toujours retiré (jamais stocké, même en JSON).
 *   - Conflit     : seules des MÉTADONNÉES non sensibles sont conservées (id, niveau,
 *                   statut, auteur, responsable, dates) — titre/description/notes DROPPÉS.
 *                   Ces métadonnées suffisent à réappliquer peutVoirConflit à la lecture.
 *
 * Limites assumées : seules les opérations unitaires create/update/delete sont tracées
 * (pas updateMany/deleteMany/createMany). L'écriture d'audit est best-effort (un échec
 * d'audit ne fait pas échouer l'opération métier) ; dans une $transaction, l'audit est
 * écrit hors transaction (rollback ⇒ éventuelle entrée orpheline, acceptable).
 */

/** Modèles audités (noms tels que fournis par l'extension — PascalCase). */
export const MODELES_AUDITES = new Set<string>([
  'Membre',
  'Contribution',
  'Versement',
  'EquilibrageContribution',
  'Utilisateur',
  'Conflit',
])

const OPERATIONS_AUDITEES = new Set<string>(['create', 'update', 'delete'])

/** L'opération (model, operation) doit-elle être auditée ? */
export function doitAuditer(model: string | undefined, operation: string): boolean {
  return model !== undefined && MODELES_AUDITES.has(model) && OPERATIONS_AUDITEES.has(operation)
}

/** Champs NON sensibles conservés pour un snapshot de Conflit. */
const CONFLIT_CHAMPS_SNAPSHOT = [
  'id',
  'niveauConfidentialite',
  'statut',
  'auteurId',
  'responsableSuiviId',
  'dateOuverture',
  'dateResolution',
] as const

/**
 * Filtre un snapshot avant stockage selon le modèle. Retourne un objet JSON-sérialisable
 * (ou null). NE contient JAMAIS de donnée sensible (passwordHash / texte de conflit).
 */
export function filtrerDonnees(model: string, data: unknown): Record<string, unknown> | null {
  if (data === null || data === undefined || typeof data !== 'object') return null
  const src = data as Record<string, unknown>

  if (model === 'Utilisateur') {
    const clone = { ...src }
    delete clone['passwordHash']
    return clone
  }
  if (model === 'Conflit') {
    // Uniquement des métadonnées non sensibles (cf. règle de confidentialité §4.4).
    const meta: Record<string, unknown> = {}
    for (const champ of CONFLIT_CHAMPS_SNAPSHOT) {
      if (champ in src) meta[champ] = src[champ]
    }
    return meta
  }
  return { ...src }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Accès camelCase du client à partir du nom de modèle PascalCase ('Membre' → 'membre'). */
function accessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

/**
 * Écrit l'entrée d'audit pour une opération déjà exécutée. `base` est le client Prisma
 * NON étendu (évite toute récursion). Best-effort : n'interrompt jamais l'opération métier.
 */
export async function capturerAudit(
  base: any,
  input: { model: string; operation: string; before: unknown; result: unknown },
): Promise<void> {
  const { model, operation, before, result } = input
  const action = operation.toUpperCase() as 'CREATE' | 'UPDATE' | 'DELETE'
  const donneesAvant = operation === 'create' ? null : filtrerDonnees(model, before)
  const donneesApres = operation === 'delete' ? null : filtrerDonnees(model, result)

  const entiteId =
    (donneesApres?.['id'] as string | undefined) ??
    (donneesAvant?.['id'] as string | undefined) ??
    (before as any)?.id ??
    (result as any)?.id ??
    'inconnu'

  await base.auditLog.create({
    data: {
      entiteType: model,
      entiteId: String(entiteId),
      action,
      acteurId: auditContext.acteurId() ?? null,
      // AuditLog est un modèle SCOPÉ mais écrit via `base` (client NON étendu, anti-récursion)
      // → l'extension d'isolation ne l'intercepte pas : on stampe explicitement l'org courante.
      organisationId: orgContext.organisationId() ?? null,
      donneesAvant: donneesAvant ?? Prisma.JsonNull,
      donneesApres: donneesApres ?? Prisma.JsonNull,
    },
  })
}

/**
 * Cœur interceptable (testable sans $extends) : capture le « avant » pour update/delete,
 * exécute l'opération, écrit l'audit (best-effort), renvoie le résultat.
 */
export async function intercepterAudit(
  base: any,
  ctx: { model: string | undefined; operation: string; args: any; query: (args: any) => Promise<any> },
): Promise<any> {
  const { model, operation, args, query } = ctx
  if (!doitAuditer(model, operation)) return query(args)

  // L'audit trail est PAR ORGANISATION (AuditLog.organisationId est NOT NULL). Les flux
  // DÉLIBÉRÉMENT non scopés (`orgContext.runUnscoped` : bootstrap SUPER_ADMIN, seed, système)
  // écrivent hors organisation → tenter un journal ferait échouer la contrainte NOT NULL.
  // On saute donc l'audit pour ces écritures système. NB : pour un modèle SCOPÉ écrit sans
  // contexte (ni org, ni unscoped), l'isolation fail-close AVANT l'audit (extension outermost),
  // donc ce cas ne parvient jamais ici — seul `unscoped` a besoin d'être filtré.
  if (orgContext.current()?.unscoped) return query(args)

  let before: unknown = null
  if (operation !== 'create') {
    before = await base[accessor(model as string)]
      .findUnique({ where: args.where })
      .catch(() => null)
  }

  const result = await query(args)

  await capturerAudit(base, { model: model as string, operation, before, result }).catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[audit] écriture du journal échouée (opération métier conservée) :', e)
  })
  return result
}

/** Extension Prisma à brancher via `prisma.$extends(auditExtension(base))`. */
export function auditExtension(base: any) {
  return Prisma.defineExtension({
    name: 'nkoni-audit',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }: any) {
          return intercepterAudit(base, { model, operation, args, query })
        },
      },
    },
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
