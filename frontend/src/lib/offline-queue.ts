/**
 * File de MUTATIONS hors-ligne (§ PWA) — persistée en IndexedDB. Chaque mutation porte une CLÉ
 * D'IDEMPOTENCE (uuid client) → un rejeu au retour du réseau ne crée pas de doublon (le backend
 * dédoublonne via l'en-tête `Idempotence-Key`). Périmètre v1 : 2 flux à forte valeur — enregistrer
 * un VERSEMENT et ajouter un MEMBRE. Le reste de l'app reste en ligne-seulement.
 */

export type TypeMutation = 'versement' | 'membre'

export interface MutationEnAttente {
  id: string
  type: TypeMutation
  /** Clé d'idempotence (uuid) portée jusqu'au backend. */
  cleIdempotence: string
  /** Corps de la requête (VersementInput | MembreInput). */
  payload: unknown
  /** Message d'erreur si un échec CLIENT (4xx) l'a bloquée (à corriger manuellement). */
  erreur?: string
  creeLe: number
}

const DB_NOM = 'nkoni-offline'
const STORE = 'mutations'

function uuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOM, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function avecStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

/* --- Abonnés (badge de file) --------------------------------------------- */
const abonnes = new Set<() => void>()
export function surChangementFile(cb: () => void): () => void {
  abonnes.add(cb)
  return () => abonnes.delete(cb)
}
function notifier() {
  for (const cb of abonnes) cb()
}

/* --- API de la file ------------------------------------------------------ */

/** Ajoute une mutation à la file et renvoie l'entrée créée (avec sa clé d'idempotence). */
export async function enfiler(type: TypeMutation, payload: unknown): Promise<MutationEnAttente> {
  const m: MutationEnAttente = { id: uuid(), type, cleIdempotence: uuid(), payload, creeLe: Date.now() }
  await avecStore('readwrite', (s) => s.add(m))
  notifier()
  return m
}

export async function listerFile(): Promise<MutationEnAttente[]> {
  const tout = await avecStore<MutationEnAttente[]>('readonly', (s) => s.getAll() as IDBRequest<MutationEnAttente[]>)
  return tout.sort((a, b) => a.creeLe - b.creeLe)
}

export async function retirerDeLaFile(id: string): Promise<void> {
  await avecStore('readwrite', (s) => s.delete(id))
  notifier()
}

export async function marquerErreur(id: string, message: string): Promise<void> {
  const m = await avecStore<MutationEnAttente | undefined>('readonly', (s) => s.get(id) as IDBRequest<MutationEnAttente | undefined>)
  if (!m) return
  await avecStore('readwrite', (s) => s.put({ ...m, erreur: message }))
  notifier()
}

export async function compterFile(): Promise<number> {
  return avecStore<number>('readonly', (s) => s.count())
}
