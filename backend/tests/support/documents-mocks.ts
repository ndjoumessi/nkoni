/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mocks pour le module V2 Documents : Prisma en mémoire (documents + entités parentes
 * pré-alimentées pour exercer la visibilité héritée) et client Blob traçant put/del.
 */

interface StoredDoc {
  id: string
  nom: string
  description: string | null
  url: string
  typeFichier: string
  tailleOctets: number
  entiteType: string
  entiteId: string
  televerseParId: string
  dateTeleversement: Date
  createdAt: Date
  seq: number
}

export interface DocumentsMockOptions {
  /** Force l'échec de document.create (pour tester le nettoyage du blob orphelin). */
  failCreate?: boolean
}

export function buildDocumentsMock(options: DocumentsMockOptions = {}) {
  // Entités parentes pré-alimentées.
  const conflits = new Map<string, any>([
    ['cf-conf', { niveauConfidentialite: 'CONFIDENTIEL', auteurId: 'u-pres', responsableSuiviId: 'u-comm' }],
    ['cf-bur', { niveauConfidentialite: 'BUREAU', auteurId: 'u-sec', responsableSuiviId: null }],
    ['cf-pub', { niveauConfidentialite: 'PUBLIC', auteurId: 'u-sec', responsableSuiviId: null }],
  ])
  const membres = new Map<string, any>([
    ['m-own', { id: 'm-own', compteUtilisateurId: 'u-membre' }],
    ['m-other', { id: 'm-other', compteUtilisateurId: 'u-autre' }],
  ])
  const reunions = new Map<string, any>([['r-1', { id: 'r-1' }]])
  const commemorations = new Map<string, any>([['cm-1', { id: 'cm-1' }]])
  const documents = new Map<string, StoredDoc>()
  let seq = 0

  const pick = (obj: any, select: any) => {
    if (!select) return { ...obj }
    const out: any = {}
    for (const k of Object.keys(select)) if (select[k] === true) out[k] = obj[k]
    return out
  }
  const view = (d: StoredDoc, select: any) => {
    const full: any = {
      id: d.id,
      nom: d.nom,
      description: d.description,
      url: d.url,
      typeFichier: d.typeFichier,
      tailleOctets: d.tailleOctets,
      entiteType: d.entiteType,
      entiteId: d.entiteId,
      dateTeleversement: d.dateTeleversement,
      createdAt: d.createdAt,
      televersePar: {
        id: d.televerseParId,
        email: `${d.televerseParId}@nkoni.test`,
        role: 'PLACEHOLDER',
      },
    }
    if (!select) return full
    const out: any = {}
    for (const k of Object.keys(select)) {
      if (select[k] === true) out[k] = full[k]
      else if (k === 'televersePar' && select[k]) out[k] = full.televersePar
    }
    return out
  }

  const prisma = {
    document: {
      findMany: async (args: any = {}) => {
        let list = [...documents.values()]
        const w = args.where ?? {}
        if (w.entiteType) list = list.filter((d) => d.entiteType === w.entiteType)
        if (w.entiteId) list = list.filter((d) => d.entiteId === w.entiteId)
        if (args.orderBy?.dateTeleversement === 'desc') {
          list = list.sort((a, b) => +b.dateTeleversement - +a.dateTeleversement || b.seq - a.seq)
        }
        return list.map((d) => view(d, args.select))
      },
      findUnique: async (args: any) => {
        const d = documents.get(args.where.id)
        return d ? view(d, args.select) : null
      },
      create: async (args: any) => {
        if (options.failCreate) throw new Error('DB create failed (mock)')
        const id = `doc-${++seq}`
        const now = new Date()
        const d: StoredDoc = {
          id,
          nom: args.data.nom,
          description: args.data.description ?? null,
          url: args.data.url,
          typeFichier: args.data.typeFichier,
          tailleOctets: args.data.tailleOctets,
          entiteType: args.data.entiteType,
          entiteId: args.data.entiteId,
          televerseParId: args.data.televersePar.connect.id,
          dateTeleversement: now,
          createdAt: now,
          seq: ++seq,
        }
        documents.set(id, d)
        return view(d, args.select)
      },
      delete: async (args: any) => {
        const d = documents.get(args.where.id)
        if (!d) throw new Error('P2025 (mock)')
        documents.delete(d.id)
        return view(d, undefined)
      },
    },
    conflit: { findUnique: async (args: any) => (conflits.has(args.where.id) ? { ...conflits.get(args.where.id) } : null) },
    membre: { findUnique: async (args: any) => (membres.has(args.where.id) ? { ...membres.get(args.where.id) } : null) },
    reunion: { findUnique: async (args: any) => (reunions.has(args.where.id) ? { ...reunions.get(args.where.id) } : null) },
    commemoration: { findUnique: async (args: any) => (commemorations.has(args.where.id) ? { ...commemorations.get(args.where.id) } : null) },
    // Helper de test : insère un document directement dans le store.
    __seedDoc: (d: Partial<StoredDoc> & { entiteType: string; entiteId: string }) => {
      const id = d.id ?? `doc-${++seq}`
      documents.set(id, {
        id,
        nom: d.nom ?? 'doc.pdf',
        description: d.description ?? null,
        url: d.url ?? `blob://seed/${id}`,
        typeFichier: d.typeFichier ?? 'application/pdf',
        tailleOctets: d.tailleOctets ?? 1000,
        entiteType: d.entiteType,
        entiteId: d.entiteId,
        televerseParId: d.televerseParId ?? 'u-admin',
        dateTeleversement: new Date(),
        createdAt: new Date(),
        seq: ++seq,
      })
      return id
    },
  }
  return prisma
}

/** Client Blob mock : trace les appels put/del. */
export function buildBlobMock() {
  const puts: Array<{ pathname: string; url: string; size: number }> = []
  const dels: string[] = []
  // Contenu stocké par URL : alimenté par `put`, relu par `lireContenu` (proxy de téléchargement).
  // Exposé pour préensemencer un contenu dans les tests de téléchargement sans passer par un upload.
  const contenus = new Map<string, Buffer>()
  const client = {
    put: async (pathname: string, data: Buffer, _opts: { contentType: string }) => {
      const url = `https://blob.test/${pathname}`
      puts.push({ pathname, url, size: data.length })
      contenus.set(url, Buffer.from(data))
      return { url }
    },
    del: async (url: string) => {
      dels.push(url)
      contenus.delete(url)
    },
    lireContenu: async (url: string) => contenus.get(url) ?? null,
  }
  return { client, puts, dels, contenus }
}

/* Buffers valides minimaux par type (magic bytes). */
export const FICHIERS = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]), // %PDF-1.4
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  docx: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
  texte: Buffer.from('hello world', 'utf8'),
}
export const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  texte: 'text/plain',
}
