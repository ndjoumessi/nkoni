/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mock Prisma en mémoire pour le module Notifications (service + routes + scheduler).
 *
 * Gère ce que les services appellent : notification (create/findMany/updateMany/count/
 * findFirst avec where {id, destinataireId, lu, type, dateCreation.gte} + orderBy
 * dateCreation), membre (findUnique + findMany pour le scheduler), baremeAnnuel.findMany.
 * Les membres et leurs contributions sont configurables ; `now` de création est injectable.
 */

export interface StoredNotif {
  id: string
  destinataireId: string
  type: string
  titre: string
  message: string
  entiteType: string | null
  entiteId: string | null
  lu: boolean
  dateCreation: Date
  dateLecture: Date | null
}

export interface MembreSeed {
  id: string
  statut?: string
  compteUtilisateurId?: string | null
  anneeAdhesion?: number
  anneeFinContribution?: number | null
  contributions?: { annee: number; montantValorise: number }[]
}

export interface UtilisateurSeed {
  id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notificationsActives?: any
}

export interface NotificationsMockOptions {
  notifs?: StoredNotif[]
  membres?: MembreSeed[]
  baremes?: { annee: number; montantAttendu: number }[]
  /** Préférences par utilisateur (sinon dérivé des membres → tout activé par défaut). */
  utilisateurs?: UtilisateurSeed[]
  /** Organisations actives renvoyées par `organisation.findMany` (wrapper multi-org). */
  organisations?: { id: string }[]
}

function matchNotif(n: StoredNotif, where: any = {}): boolean {
  if (where.id !== undefined && n.id !== where.id) return false
  if (where.destinataireId !== undefined && n.destinataireId !== where.destinataireId) return false
  if (where.lu !== undefined && n.lu !== where.lu) return false
  if (where.type !== undefined && n.type !== where.type) return false
  if (where.dateCreation?.gte !== undefined && n.dateCreation < where.dateCreation.gte) return false
  return true
}

export function buildNotificationsMock(options: NotificationsMockOptions = {}) {
  const notifs = new Map<string, StoredNotif>((options.notifs ?? []).map((n) => [n.id, { ...n }]))
  const membres = new Map<string, MembreSeed>(
    (options.membres ?? []).map((m) => [
      m.id,
      {
        statut: 'ACTIF',
        compteUtilisateurId: null,
        anneeAdhesion: 2020,
        anneeFinContribution: null,
        contributions: [],
        ...m,
      },
    ]),
  )
  const baremes = options.baremes ?? []

  // Utilisateurs : ceux fournis + un défaut (préférences null = tout activé) pour chaque
  // compte lié à un membre non déjà décrit.
  const utilisateurs = new Map<string, UtilisateurSeed>(
    (options.utilisateurs ?? []).map((u) => [u.id, { notificationsActives: null, ...u }]),
  )
  for (const m of membres.values()) {
    if (m.compteUtilisateurId && !utilisateurs.has(m.compteUtilisateurId)) {
      utilisateurs.set(m.compteUtilisateurId, {
        id: m.compteUtilisateurId,
        notificationsActives: null,
      })
    }
  }
  let seq = 0

  const prisma: any = {
    notification: {
      create: async ({ data }: any) => {
        const n: StoredNotif = {
          id: `n-${++seq}`,
          entiteType: null,
          entiteId: null,
          lu: false,
          dateLecture: null,
          dateCreation: data.dateCreation ?? new Date(),
          ...data,
        }
        notifs.set(n.id, n)
        return { ...n }
      },
      findMany: async ({ where = {}, orderBy }: any = {}) => {
        let res = [...notifs.values()].filter((n) => matchNotif(n, where))
        if (orderBy?.dateCreation === 'desc') {
          res = res.sort((a, b) => b.dateCreation.getTime() - a.dateCreation.getTime())
        }
        return res.map((n) => ({ ...n }))
      },
      findFirst: async ({ where = {} }: any = {}) => {
        const r = [...notifs.values()].find((n) => matchNotif(n, where))
        return r ? { ...r } : null
      },
      updateMany: async ({ where = {}, data }: any) => {
        let count = 0
        for (const n of notifs.values()) {
          if (matchNotif(n, where)) {
            Object.assign(n, data)
            count += 1
          }
        }
        return { count }
      },
      count: async ({ where = {} }: any = {}) =>
        [...notifs.values()].filter((n) => matchNotif(n, where)).length,
    },
    membre: {
      findUnique: async ({ where }: any) => {
        const m = membres.get(where.id)
        return m ? { ...m } : null
      },
      findMany: async ({ where = {} }: any = {}) => {
        let res = [...membres.values()]
        if (where.statut !== undefined) res = res.filter((m) => m.statut === where.statut)
        // compteUtilisateurId: { not: null }
        if (where.compteUtilisateurId?.not === null) {
          res = res.filter((m) => m.compteUtilisateurId != null)
        }
        return res.map((m) => ({ ...m }))
      },
    },
    baremeAnnuel: {
      findMany: async () => baremes.map((b) => ({ ...b })),
    },
    organisation: {
      findMany: async () => (options.organisations ?? []).map((o) => ({ ...o })),
    },
    utilisateur: {
      findUnique: async ({ where }: any) => {
        const u = utilisateurs.get(where.id)
        return u ? { notificationsActives: u.notificationsActives ?? null } : null
      },
      update: async ({ where, data }: any) => {
        const u = utilisateurs.get(where.id) ?? { id: where.id }
        u.notificationsActives = data.notificationsActives
        utilisateurs.set(where.id, u)
        return { id: where.id, notificationsActives: u.notificationsActives }
      },
    },
  }

  return { prisma, notifs, utilisateurs }
}
