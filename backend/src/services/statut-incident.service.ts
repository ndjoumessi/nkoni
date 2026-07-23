/**
 * Bannière d'incident de `/statut` (§2.2/§8) — ligne UNIQUE (id fixe), modèle PLATEFORME NON SCOPÉ.
 * Décuplé de Fastify, Prisma injecté (mockable). Aucun `runUnscoped` requis : `StatutIncident`
 * n'est pas dans `SCOPED_MODELS`, l'extension d'isolation le laisse passer sans contexte org.
 */

export type GraviteIncident = 'INFO' | 'MAINTENANCE' | 'INCIDENT'

export interface StatutIncidentData {
  actif: boolean
  gravite: GraviteIncident
  message: string
}

export interface StatutIncident extends StatutIncidentData {
  updatedAt: Date
}

/** Id de la ligne unique — un seul état d'incident courant, géré en upsert. */
const ID_SINGLETON = 'singleton'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface StatutIncidentPrisma {
  statutIncident: {
    findUnique(args: any): Promise<any>
    upsert(args: any): Promise<any>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Lit l'incident courant. `null` s'il n'a jamais été configuré. */
export async function lireIncident(prisma: StatutIncidentPrisma): Promise<StatutIncident | null> {
  return prisma.statutIncident.findUnique({ where: { id: ID_SINGLETON } })
}

/** Définit / met à jour l'incident (upsert de la ligne unique). */
export async function definirIncident(
  prisma: StatutIncidentPrisma,
  data: StatutIncidentData,
): Promise<StatutIncident> {
  return prisma.statutIncident.upsert({
    where: { id: ID_SINGLETON },
    create: { id: ID_SINGLETON, ...data },
    update: data,
  })
}
