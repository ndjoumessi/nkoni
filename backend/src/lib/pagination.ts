/**
 * Pagination par offset — helper PARTAGÉ (audit m4) pour borner les listes qui grandissent sans
 * limite (dépenses, versements, audit…). Évite de sérialiser des milliers de lignes sur un forfait
 * illimité. Contrat de réponse stable `{ items, total, page, pageSize }` réutilisé côté front.
 */
// Privées : elles n'ont jamais eu de consommateur hors de ce module. Les exporter offrait deux
// poignées de plus à apprendre pour des bornes que seul `resoudrePagination` doit appliquer.
const PAGE_SIZE_DEFAUT = 25
const PAGE_SIZE_MAX = 100

export interface Pagination {
  page: number
  pageSize: number
  /** `skip`/`take` prêts pour Prisma. */
  skip: number
  take: number
}

/** Normalise `page`/`pageSize` (bornes + défauts) → jamais de valeur négative ni de page géante. */
export function resoudrePagination(q?: { page?: number; pageSize?: number }): Pagination {
  const page = Math.max(1, Math.floor(q?.page ?? 1))
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Math.floor(q?.pageSize ?? PAGE_SIZE_DEFAUT)))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

/**
 * Enveloppe de réponse paginée — le contrat que le front consomme (`Paginated<T>` côté client).
 * Les routes paginées TYPENT leur retour avec elle : sans cela le contrat n'était affirmé nulle
 * part, et `StatutsMembresPageResultat` en recopiait les quatre champs au lieu de l'étendre.
 */
export interface PageResultat<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Fragment de schéma ajv `page`/`pageSize` à fusionner dans les `querystring.properties` d'une route. */
export const PAGINATION_PROPS = {
  page: { type: 'integer', minimum: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: PAGE_SIZE_MAX },
} as const
