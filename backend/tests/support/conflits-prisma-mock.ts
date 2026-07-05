/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mock Prisma en mémoire pour le module V2 Conflits.
 *
 * Gère ce que conflit.service appelle : conflit (findMany/findUnique avec include
 * auteur/responsableSuivi/membresConcernes, create, update), la table de jointure explicite
 * conflitMembreConcerne (createMany) et `$transaction` interactif, utilisateur (findUnique —
 * comptes pré-alimentés, pour valider responsableSuiviId), membre (findMany where id in —
 * pour valider membresConcernes).
 *
 * IMPORTANT : l'include ne renvoie que des champs SÛRS (jamais passwordHash).
 */

interface StoredUser {
  id: string
  email: string
  role: string
}
interface StoredMembre {
  id: string
  nom: string
  prenom: string
}
interface StoredConflit {
  id: string
  titre: string
  description: string
  niveauConfidentialite: string
  statut: string
  auteurId: string
  responsableSuiviId: string | null
  membresConcernes: string[]
  dateOuverture: Date
  dateResolution: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  seq: number
}

export const UTILISATEURS: Array<{ id: string; role: string }> = [
  { id: 'u-admin', role: 'ADMIN' },
  { id: 'u-pres', role: 'PRESIDENT' },
  { id: 'u-sec', role: 'SECRETAIRE' },
  { id: 'u-tres', role: 'TRESORIERE' },
  { id: 'u-comm', role: 'COMMISSAIRE_COMPTES' },
  { id: 'u-membre', role: 'MEMBRE_SIMPLE' },
  { id: 'u-guide', role: 'GUIDE_RELIGIEUX' },
]

export function buildConflitsMock() {
  const users = new Map<string, StoredUser>(
    UTILISATEURS.map((u) => [u.id, { id: u.id, email: `${u.id}@nkoni.test`, role: u.role }]),
  )
  const membres = new Map<string, StoredMembre>([
    ['m-1', { id: 'm-1', nom: 'Nkoa', prenom: 'Awa' }],
    ['m-2', { id: 'm-2', nom: 'Etoa', prenom: 'Blaise' }],
  ])
  const conflits = new Map<string, StoredConflit>()
  let seq = 0
  const nextId = () => `cf-${++seq}`

  const userView = (id: string | null) => {
    if (!id) return null
    const u = users.get(id)
    return u ? { id: u.id, email: u.email, role: u.role } : null
  }
  // `membresConcernes` exposé sous forme de lignes de jointure ([{ membre }]) — comme l'include
  // Prisma réel du join explicite — que le service aplati ensuite (projeter).
  const view = (c: StoredConflit) => ({
    id: c.id,
    titre: c.titre,
    description: c.description,
    niveauConfidentialite: c.niveauConfidentialite,
    statut: c.statut,
    auteurId: c.auteurId,
    responsableSuiviId: c.responsableSuiviId,
    dateOuverture: c.dateOuverture,
    dateResolution: c.dateResolution,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    auteur: userView(c.auteurId),
    responsableSuivi: userView(c.responsableSuiviId),
    membresConcernes: c.membresConcernes
      .map((id) => membres.get(id))
      .filter((m): m is StoredMembre => !!m)
      .map((m) => ({ membre: { id: m.id, nom: m.nom, prenom: m.prenom } })),
  })

  const api: any = {
    conflit: {
      findMany: async (args: any = {}) => {
        let list = [...conflits.values()]
        if (args.orderBy?.dateOuverture === 'desc') {
          list = list.sort((a, b) => +b.dateOuverture - +a.dateOuverture || b.seq - a.seq)
        }
        return list.map(view)
      },
      findUnique: async (args: any) => {
        const c = conflits.get(args.where.id)
        return c ? view(c) : null
      },
      create: async (args: any) => {
        const d = args.data
        const id = nextId()
        const now = new Date()
        const c: StoredConflit = {
          id,
          titre: d.titre,
          description: d.description,
          niveauConfidentialite: d.niveauConfidentialite,
          statut: d.statut ?? 'OUVERT',
          auteurId: d.auteur.connect.id,
          responsableSuiviId: d.responsableSuivi?.connect?.id ?? null,
          membresConcernes: [], // liens posés séparément via conflitMembreConcerne
          dateOuverture: now,
          dateResolution: null,
          notes: d.notes ?? null,
          createdAt: now,
          updatedAt: now,
          seq: ++seq,
        }
        conflits.set(id, c)
        return view(c)
      },
      update: async (args: any) => {
        const c = conflits.get(args.where.id)
        if (!c) throw new Error('P2025 (mock): conflit absent')
        const d = args.data
        if (d.statut !== undefined) c.statut = d.statut
        if (d.notes !== undefined) c.notes = d.notes
        if (d.dateResolution !== undefined) {
          c.dateResolution = d.dateResolution === null ? null : new Date(d.dateResolution)
        }
        c.updatedAt = new Date()
        return view(c)
      },
    },
    // Table de jointure explicite : reflète les liens dans le membresConcernes du parent.
    conflitMembreConcerne: {
      createMany: async (args: any) => {
        const rows: any[] = args.data ?? []
        for (const r of rows) {
          const c = conflits.get(r.conflitId)
          if (c && !c.membresConcernes.includes(r.membreId)) c.membresConcernes.push(r.membreId)
        }
        return { count: rows.length }
      },
    },
    utilisateur: {
      findUnique: async (args: any) => {
        const u = users.get(args.where.id)
        return u ? { ...u } : null
      },
      findMany: async (args: any = {}) => {
        // Tous les comptes du mock sont actifs. Renvoie les champs sûrs demandés.
        let list = [...users.values()]
        if (args.orderBy?.email === 'asc') list = list.sort((a, b) => a.email.localeCompare(b.email))
        return list.map((u) => ({ id: u.id, email: u.email, role: u.role }))
      },
    },
    membre: {
      findMany: async (args: any) => {
        const ids: string[] = args.where?.id?.in ?? []
        return ids
          .map((id) => membres.get(id))
          .filter((m): m is StoredMembre => !!m)
          .map((m) => ({ id: m.id }))
      },
    },
    // $transaction interactif : passe le mock lui-même comme `tx`.
    $transaction: async (fn: any) => fn(api),
  }
  return api
}
