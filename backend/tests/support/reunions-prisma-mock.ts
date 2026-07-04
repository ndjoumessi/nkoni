/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '../../src/generated/prisma/client'

/**
 * Mock Prisma en mémoire pour les modules V1.1 (Réunions / Points / Résolutions).
 * Partagé par reunions.route.test.ts et resolutions.route.test.ts.
 *
 * Gère juste ce que les services appellent : include points/resolutions + _count,
 * create imbriqué (pointsOrdreDuJour.create[]), $transaction (Promise.all), cascade à la
 * suppression d'une réunion, et P2025 quand la cible d'un update/delete est absente.
 */

function p2025() {
  return new Prisma.PrismaClientKnownRequestError('NotFound', {
    code: 'P2025',
    clientVersion: 'test',
  })
}

interface StoredReunion {
  id: string
  date: Date
  lieu: string
  type: string
  statut: string
  compteRenduTexte: string | null
  createdAt: Date
  updatedAt: Date
}
interface StoredPoint {
  id: string
  reunionId: string
  titre: string
  ordre: number
  notes: string | null
  seq: number
}
interface StoredResolution {
  id: string
  reunionId: string
  pointOrdreDuJourId: string | null
  texte: string
  statut: string
  dateVote: Date | null
  seq: number
}

export function buildReunionsMock() {
  const reunions = new Map<string, StoredReunion>()
  const points = new Map<string, StoredPoint>()
  const resolutions = new Map<string, StoredResolution>()
  let seq = 0
  const nextId = (p: string) => `${p}-${++seq}`

  const pointsOf = (reunionId: string) =>
    [...points.values()].filter((p) => p.reunionId === reunionId).sort((a, b) => a.ordre - b.ordre)
  const resolutionsOf = (reunionId: string) =>
    [...resolutions.values()]
      .filter((r) => r.reunionId === reunionId)
      .sort((a, b) => a.seq - b.seq)

  const withInclude = (r: StoredReunion, include: any) => {
    if (!include) return { ...r }
    const out: any = { ...r }
    if (include.pointsOrdreDuJour) out.pointsOrdreDuJour = pointsOf(r.id).map((p) => ({ ...p }))
    if (include.resolutions) out.resolutions = resolutionsOf(r.id).map((r2) => ({ ...r2 }))
    if (include._count) {
      out._count = {
        pointsOrdreDuJour: pointsOf(r.id).length,
        resolutions: resolutionsOf(r.id).length,
      }
    }
    return out
  }

  const prisma = {
    reunion: {
      findMany: async (args: any = {}) => {
        let list = [...reunions.values()]
        if (args.orderBy?.date === 'desc') list = list.sort((a, b) => +b.date - +a.date)
        return list.map((r) => withInclude(r, args.include))
      },
      findUnique: async (args: any) => {
        const r = reunions.get(args.where.id)
        return r ? withInclude(r, args.include) : null
      },
      create: async (args: any) => {
        const id = nextId('reu')
        const now = new Date()
        const r: StoredReunion = {
          id,
          date: new Date(args.data.date),
          lieu: args.data.lieu,
          type: args.data.type ?? 'ORDINAIRE',
          statut: args.data.statut ?? 'PLANIFIEE',
          compteRenduTexte: args.data.compteRenduTexte ?? null,
          createdAt: now,
          updatedAt: now,
        }
        reunions.set(id, r)
        const nested = args.data.pointsOrdreDuJour?.create as any[] | undefined
        if (nested) {
          for (const p of nested) {
            const pid = nextId('pt')
            points.set(pid, {
              id: pid,
              reunionId: id,
              titre: p.titre,
              ordre: p.ordre,
              notes: p.notes ?? null,
              seq: ++seq,
            })
          }
        }
        return withInclude(r, args.include)
      },
      update: async (args: any) => {
        const r = reunions.get(args.where.id)
        if (!r) throw p2025()
        const d = args.data
        if (d.date !== undefined) r.date = new Date(d.date)
        if (d.lieu !== undefined) r.lieu = d.lieu
        if (d.type !== undefined) r.type = d.type
        if (d.statut !== undefined) r.statut = d.statut
        if (d.compteRenduTexte !== undefined) r.compteRenduTexte = d.compteRenduTexte
        r.updatedAt = new Date()
        return withInclude(r, args.include)
      },
      delete: async (args: any) => {
        const r = reunions.get(args.where.id)
        if (!r) throw p2025()
        reunions.delete(r.id)
        // Cascade DB simulée.
        for (const p of pointsOf(r.id)) points.delete(p.id)
        for (const res of resolutionsOf(r.id)) resolutions.delete(res.id)
        return { ...r }
      },
    },
    pointOrdreDuJour: {
      findUnique: async (args: any) => {
        const p = points.get(args.where.id)
        return p ? { ...p } : null
      },
      create: async (args: any) => {
        const id = nextId('pt')
        const p: StoredPoint = {
          id,
          reunionId: args.data.reunionId,
          titre: args.data.titre,
          ordre: args.data.ordre,
          notes: args.data.notes ?? null,
          seq: ++seq,
        }
        points.set(id, p)
        return { ...p }
      },
      update: async (args: any) => {
        const p = points.get(args.where.id)
        if (!p) throw p2025()
        if (args.data.titre !== undefined) p.titre = args.data.titre
        if (args.data.notes !== undefined) p.notes = args.data.notes
        if (args.data.ordre !== undefined) p.ordre = args.data.ordre
        return { ...p }
      },
      delete: async (args: any) => {
        const p = points.get(args.where.id)
        if (!p) throw p2025()
        points.delete(p.id)
        return { ...p }
      },
    },
    resolution: {
      findMany: async (args: any) => resolutionsOf(args.where.reunionId).map((r) => ({ ...r })),
      findUnique: async (args: any) => {
        const r = resolutions.get(args.where.id)
        return r ? { ...r } : null
      },
      create: async (args: any) => {
        const id = nextId('res')
        const r: StoredResolution = {
          id,
          reunionId: args.data.reunionId,
          pointOrdreDuJourId: args.data.pointOrdreDuJourId ?? null,
          texte: args.data.texte,
          statut: args.data.statut ?? 'ADOPTEE',
          dateVote: args.data.dateVote ? new Date(args.data.dateVote) : null,
          seq: ++seq,
        }
        resolutions.set(id, r)
        return { ...r }
      },
      update: async (args: any) => {
        const r = resolutions.get(args.where.id)
        if (!r) throw p2025()
        const d = args.data
        if (d.texte !== undefined) r.texte = d.texte
        if (d.statut !== undefined) r.statut = d.statut
        if (d.dateVote !== undefined) r.dateVote = d.dateVote === null ? null : new Date(d.dateVote)
        if (d.pointOrdreDuJourId !== undefined) r.pointOrdreDuJourId = d.pointOrdreDuJourId
        return { ...r }
      },
      delete: async (args: any) => {
        const r = resolutions.get(args.where.id)
        if (!r) throw p2025()
        resolutions.delete(r.id)
        return { ...r }
      },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  }

  return prisma
}
