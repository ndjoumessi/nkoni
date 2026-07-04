/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '../../src/generated/prisma/client'

/**
 * Mock Prisma en mémoire pour le module V2 Commémorations.
 * Gère : commemoration (findMany/findUnique avec include membresConcernes, create avec
 * connect, update avec set, delete + P2025) et membre.findMany (ids pré-alimentés).
 */

function p2025() {
  return new Prisma.PrismaClientKnownRequestError('NotFound', {
    code: 'P2025',
    clientVersion: 'test',
  })
}

interface StoredMembre {
  id: string
  nom: string
  prenom: string
}
interface StoredCommemoration {
  id: string
  titre: string
  type: string
  date: Date
  lieu: string | null
  description: string | null
  statut: string
  notes: string | null
  membresConcernes: string[]
  createdAt: Date
  updatedAt: Date
  seq: number
}

export function buildCommemorationsMock() {
  const membres = new Map<string, StoredMembre>([
    ['m-1', { id: 'm-1', nom: 'Nkoa', prenom: 'Awa' }],
    ['m-2', { id: 'm-2', nom: 'Etoa', prenom: 'Blaise' }],
    ['m-3', { id: 'm-3', nom: 'Mballa', prenom: 'Chantal' }],
  ])
  const commemorations = new Map<string, StoredCommemoration>()
  let seq = 0
  const nextId = () => `cm-${++seq}`

  const membreView = (id: string) => {
    const m = membres.get(id)
    return m ? { id: m.id, nom: m.nom, prenom: m.prenom } : null
  }
  const view = (c: StoredCommemoration) => ({
    id: c.id,
    titre: c.titre,
    type: c.type,
    date: c.date,
    lieu: c.lieu,
    description: c.description,
    statut: c.statut,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    membresConcernes: c.membresConcernes
      .map(membreView)
      .filter((m): m is { id: string; nom: string; prenom: string } => !!m),
  })

  return {
    commemoration: {
      findMany: async (args: any = {}) => {
        let list = [...commemorations.values()]
        if (args.orderBy?.date === 'desc') {
          list = list.sort((a, b) => +b.date - +a.date || b.seq - a.seq)
        }
        return list.map(view)
      },
      findUnique: async (args: any) => {
        const c = commemorations.get(args.where.id)
        return c ? view(c) : null
      },
      create: async (args: any) => {
        const d = args.data
        const id = nextId()
        const now = new Date()
        const c: StoredCommemoration = {
          id,
          titre: d.titre,
          type: d.type ?? 'COMMEMORATION',
          date: new Date(d.date),
          lieu: d.lieu ?? null,
          description: d.description ?? null,
          statut: d.statut ?? 'PLANIFIEE',
          notes: d.notes ?? null,
          membresConcernes: (d.membresConcernes?.connect ?? []).map((m: any) => m.id),
          createdAt: now,
          updatedAt: now,
          seq: ++seq,
        }
        commemorations.set(id, c)
        return view(c)
      },
      update: async (args: any) => {
        const c = commemorations.get(args.where.id)
        if (!c) throw p2025()
        const d = args.data
        if (d.titre !== undefined) c.titre = d.titre
        if (d.type !== undefined) c.type = d.type
        if (d.date !== undefined) c.date = new Date(d.date)
        if (d.lieu !== undefined) c.lieu = d.lieu
        if (d.description !== undefined) c.description = d.description
        if (d.statut !== undefined) c.statut = d.statut
        if (d.notes !== undefined) c.notes = d.notes
        if (d.membresConcernes?.set !== undefined) {
          c.membresConcernes = d.membresConcernes.set.map((m: any) => m.id)
        }
        c.updatedAt = new Date()
        return view(c)
      },
      delete: async (args: any) => {
        const c = commemorations.get(args.where.id)
        if (!c) throw p2025()
        commemorations.delete(c.id)
        return view(c)
      },
    },
    membre: {
      findMany: async (args: any = {}) => {
        // Avec where.id.in → validation (sous-ensemble) ; sans where → liste complète.
        const inIds: string[] | undefined = args.where?.id?.in
        let list = [...membres.values()]
        if (inIds) list = list.filter((m) => inIds.includes(m.id))
        return list.map((m) => ({ id: m.id, nom: m.nom, prenom: m.prenom }))
      },
    },
  }
}
