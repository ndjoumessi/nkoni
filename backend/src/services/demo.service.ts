import { findUserById, type AuthenticatedUser, type AuthPrisma } from './auth.service'

/**
 * Espace de démonstration partagé (spec 2026-09-15) — accès au compte de démonstration.
 *
 * À appeler sous `orgContext.runUnscoped` : aucune session n'existe encore, et `Utilisateur` est un
 * modèle scopé. L'organisation retenue est la PLUS RÉCENTE marquée `estDemo` (la régénération crée la
 * nouvelle avant de supprimer l'ancienne, §3.2), et le compte est son premier ADMIN actif.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CompteDemoPrisma extends AuthPrisma {
  organisation: { findFirst(args: any): Promise<any> }
  utilisateur: AuthPrisma['utilisateur'] & { findFirst(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function chargerCompteDemo(prisma: CompteDemoPrisma): Promise<AuthenticatedUser | null> {
  const org = await prisma.organisation.findFirst({
    where: { estDemo: true, actif: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!org) return null
  const compte = await prisma.utilisateur.findFirst({
    where: { organisationId: org.id, role: 'ADMIN', actif: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!compte) return null
  return findUserById(prisma, compte.id)
}
