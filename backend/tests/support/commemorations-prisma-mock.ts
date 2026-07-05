/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '../../src/generated/prisma/client'

/**
 * Mock Prisma en mémoire pour le module V2 Commémorations.
 * Gère : commemoration (findMany/findUnique avec include membresConcernes, create, update,
 * delete + P2025), la table de jointure explicite commemorationMembreConcerne
 * (createMany/deleteMany) et `$transaction` interactif, plus membre.findMany (pré-alimenté).
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
  // `membresConcernes` est exposé sous forme de lignes de jointure ([{ membre }]) — comme
  // l'include Prisma réel du join explicite — que le service aplati ensuite (projeter).
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
      .filter((m): m is { id: string; nom: string; prenom: string } => !!m)
      .map((membre) => ({ membre })),
  })

  const api: any = {
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
          membresConcernes: [], // liens posés séparément via commemorationMembreConcerne
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
    // Table de jointure explicite : reflète les liens dans le membresConcernes du parent.
    commemorationMembreConcerne: {
      createMany: async (args: any) => {
        const rows: any[] = args.data ?? []
        for (const r of rows) {
          const c = commemorations.get(r.commemorationId)
          if (c && !c.membresConcernes.includes(r.membreId)) c.membresConcernes.push(r.membreId)
        }
        return { count: rows.length }
      },
      deleteMany: async (args: any) => {
        const cid: string | undefined = args.where?.commemorationId
        if (cid) {
          const c = commemorations.get(cid)
          if (c) {
            const n = c.membresConcernes.length
            c.membresConcernes = []
            return { count: n }
          }
        }
        return { count: 0 }
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
    // $transaction interactif : passe le mock lui-même comme `tx`.
    $transaction: async (fn: any) => fn(api),
  }
  return api
}
