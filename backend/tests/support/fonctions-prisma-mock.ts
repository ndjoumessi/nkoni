/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '../../src/generated/prisma/client'

/**
 * Mock Prisma en mémoire pour les modules V1.1 Fonctions / Affectations.
 * Partagé par fonctions.route.test.ts et affectations.route.test.ts.
 *
 * Gère ce que les services appellent : fonctionFamiliale (findMany/findUnique avec
 * include affectations + _count, create avec unicité `nom` → P2002, update, delete avec
 * cascade), affectationFonction (findFirst/findMany avec where+orderBy+include, create,
 * update), membre (findUnique, pré-alimenté), et $transaction (Promise.all).
 */

function p2025() {
  return new Prisma.PrismaClientKnownRequestError('NotFound', {
    code: 'P2025',
    clientVersion: 'test',
  })
}
function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  })
}

interface StoredFonction {
  id: string
  nom: string
  description: string | null
  createdAt: Date
}
interface StoredMembre {
  id: string
  nom: string
  prenom: string
}
interface StoredAffectation {
  id: string
  fonctionId: string
  membreId: string
  dateDebut: Date
  dateFin: Date | null
  notes: string | null
  createdAt: Date
  seq: number
}

export function buildFonctionsMock(
  membres: Array<{ id: string; nom: string; prenom: string }> = [
    { id: 'm-1', nom: 'Nkoa', prenom: 'Awa' },
    { id: 'm-2', nom: 'Etoa', prenom: 'Blaise' },
    { id: 'm-3', nom: 'Mballa', prenom: 'Chantal' },
  ],
) {
  const fonctions = new Map<string, StoredFonction>()
  const affectations = new Map<string, StoredAffectation>()
  const membresMap = new Map<string, StoredMembre>(membres.map((m) => [m.id, { ...m }]))
  let seq = 0
  const nextId = (p: string) => `${p}-${++seq}`

  const membreView = (id: string) => {
    const m = membresMap.get(id)
    return m ? { id: m.id, nom: m.nom, prenom: m.prenom } : null
  }
  const fonctionView = (id: string) => {
    const f = fonctions.get(id)
    return f ? { id: f.id, nom: f.nom, description: f.description } : null
  }
  const affectationsOf = (fonctionId: string) =>
    [...affectations.values()].filter((a) => a.fonctionId === fonctionId)

  const includeAffectation = (a: StoredAffectation, include: any) => {
    const out: any = { ...a }
    if (include?.membre) out.membre = membreView(a.membreId)
    if (include?.fonction) out.fonction = fonctionView(a.fonctionId)
    return out
  }

  const includeFonction = (f: StoredFonction, include: any) => {
    if (!include) return { ...f }
    const out: any = { ...f }
    if (include.affectations) {
      let list = affectationsOf(f.id)
      if (include.affectations.where?.dateFin === null) {
        list = list.filter((a) => a.dateFin === null)
      }
      if (include.affectations.orderBy?.dateDebut === 'desc') {
        list = [...list].sort((a, b) => +b.dateDebut - +a.dateDebut)
      }
      out.affectations = list.map((a) => includeAffectation(a, include.affectations.include))
    }
    if (include._count) out._count = { affectations: affectationsOf(f.id).length }
    return out
  }

  /** Filtre where sur les affectations (fonctionId / membreId / dateFin=null). */
  const matchAffectation = (a: StoredAffectation, where: any = {}) => {
    if (where.fonctionId !== undefined && a.fonctionId !== where.fonctionId) return false
    if (where.membreId !== undefined && a.membreId !== where.membreId) return false
    if (where.dateFin === null && a.dateFin !== null) return false
    return true
  }

  const prisma = {
    fonctionFamiliale: {
      findMany: async (args: any = {}) => {
        let list = [...fonctions.values()]
        if (args.orderBy?.nom === 'asc') list = list.sort((a, b) => a.nom.localeCompare(b.nom))
        return list.map((f) => includeFonction(f, args.include))
      },
      findUnique: async (args: any) => {
        const f = fonctions.get(args.where.id)
        return f ? includeFonction(f, args.include) : null
      },
      create: async (args: any) => {
        if ([...fonctions.values()].some((f) => f.nom === args.data.nom)) throw p2002()
        const id = nextId('fn')
        const f: StoredFonction = {
          id,
          nom: args.data.nom,
          description: args.data.description ?? null,
          createdAt: new Date(),
        }
        fonctions.set(id, f)
        return includeFonction(f, args.include)
      },
      update: async (args: any) => {
        const f = fonctions.get(args.where.id)
        if (!f) throw p2025()
        if (args.data.nom !== undefined) {
          if ([...fonctions.values()].some((o) => o.id !== f.id && o.nom === args.data.nom)) {
            throw p2002()
          }
          f.nom = args.data.nom
        }
        if (args.data.description !== undefined) f.description = args.data.description
        return includeFonction(f, args.include)
      },
      delete: async (args: any) => {
        const f = fonctions.get(args.where.id)
        if (!f) throw p2025()
        fonctions.delete(f.id)
        for (const a of affectationsOf(f.id)) affectations.delete(a.id) // cascade DB simulée
        return { ...f }
      },
    },
    membre: {
      findUnique: async (args: any) => {
        const m = membresMap.get(args.where.id)
        return m ? { ...m } : null
      },
    },
    affectationFonction: {
      findFirst: async (args: any) => {
        const found = [...affectations.values()].find((a) => matchAffectation(a, args.where))
        return found ? { ...found } : null
      },
      findMany: async (args: any = {}) => {
        let list = [...affectations.values()].filter((a) => matchAffectation(a, args.where))
        if (args.orderBy?.dateDebut === 'desc') {
          list = list.sort((a, b) => +b.dateDebut - +a.dateDebut || b.seq - a.seq)
        }
        return list.map((a) => includeAffectation(a, args.include))
      },
      create: async (args: any) => {
        const id = nextId('af')
        const a: StoredAffectation = {
          id,
          fonctionId: args.data.fonctionId,
          membreId: args.data.membreId,
          dateDebut: new Date(args.data.dateDebut),
          dateFin: args.data.dateFin ? new Date(args.data.dateFin) : null,
          notes: args.data.notes ?? null,
          createdAt: new Date(),
          seq: ++seq,
        }
        affectations.set(id, a)
        return includeAffectation(a, args.include)
      },
      update: async (args: any) => {
        const a = affectations.get(args.where.id)
        if (!a) throw p2025()
        if (args.data.dateFin !== undefined) {
          a.dateFin = args.data.dateFin === null ? null : new Date(args.data.dateFin)
        }
        if (args.data.notes !== undefined) a.notes = args.data.notes
        return includeAffectation(a, args.include)
      },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  }

  return prisma
}
