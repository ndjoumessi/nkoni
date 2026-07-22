/**
 * Service « membres avec statut de cotisation » — NKONI.
 *
 * Sert la liste des membres enrichie de leur statut cumulatif (A_JOUR/PARTIEL/NON_A_JOUR)
 * calculé EN MASSE en une seule passe, pour éviter le N+1 qu'imposerait un appel
 * `GET /membres/:id/statut` par membre côté frontend (100+ membres possibles).
 *
 * Réutilise la fonction pure `calculerStatutContribution` (§4.1) — même règle de vérité que
 * `GET /membres/:id/statut` et que le dashboard : aucun statut n'est stocké, tout est
 * recalculé à partir des `montantValorise` courants.
 */

import {
  calculerStatutContribution,
  type StatutContributionValue,
} from './statutContribution'

export type StatutMembreValue = 'ACTIF' | 'INACTIF' | 'DECEDE'

export interface MembreAvecStatut {
  id: string
  nom: string
  prenom: string
  sexe: string | null
  statut: StatutMembreValue
  telephone: string | null
  brancheId: string | null
  branche: { id: string; nom: string } | null
  anneeAdhesion: number
  anneeFinContribution: number | null
  statutCotisation: StatutContributionValue
  totalAttenduCumule: number
  totalValoriseCumule: number
}

export interface MembreStatutPrisma {
  baremeAnnuel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<{ annee: number; montantAttendu: number }[]>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<any[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(args?: any): Promise<number>
  }
}

/** Réponse bornée : les statuts calculés + le total réel + un drapeau de troncature (audit m4). */
export interface StatutsMembresResultat {
  items: MembreAvecStatut[]
  total: number
  tronque: boolean
}

/**
 * Plafond du nombre de membres renvoyés par `/membres/statuts` (audit m4 : borne la réponse
 * pour ne pas sérialiser une liste illimitée sur un gros forfait). Généreux : aucune org réelle
 * ne l'approche ; au-delà, `tronque` le signale (une vraie pagination serveur avec recherche
 * viendra quand une org PRO dépassera ce volume — elle exige de matérialiser le statut calculé).
 */
export const PLAFOND_STATUTS_MEMBRES = 1000

/**
 * Charge les membres (filtrés par `where` si fourni — ex. restriction MEMBRE_SIMPLE à sa propre
 * fiche), BORNÉS à `limite`, et leur associe leur statut de cotisation cumulatif. Une requête
 * membres + une requête barèmes + un `count` (total réel) ; le calcul de statut est en mémoire.
 */
export async function calculerStatutsMembres(
  prisma: MembreStatutPrisma,
  anneeCourante: number,
  where?: Record<string, unknown>,
  limite?: number,
): Promise<StatutsMembresResultat> {
  const [baremes, total, membres] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: { annee: true, montantAttendu: true } }),
    prisma.membre.count(where ? { where } : undefined),
    prisma.membre.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      ...(limite != null ? { take: limite } : {}),
      select: {
        id: true,
        nom: true,
        prenom: true,
        sexe: true,
        statut: true,
        telephone: true,
        brancheId: true,
        branche: { select: { id: true, nom: true } },
        anneeAdhesion: true,
        anneeFinContribution: true,
        contributions: { select: { annee: true, montantValorise: true } },
      },
    }),
  ])

  const items = membres.map((m) => construireMembreAvecStatut(m, baremes, anneeCourante))
  return { items, total, tronque: limite != null && total > limite }
}

/* -------------------------------------------------------------------------- */
/* Pagination RÉELLE (§1.3) — au-delà du plafond de 1000                       */
/* -------------------------------------------------------------------------- */

/**
 * Projection membre→statut, factorisée entre la réponse bornée et la réponse paginée.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function construireMembreAvecStatut(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: any,
  baremes: { annee: number; montantAttendu: number }[],
  anneeCourante: number,
): MembreAvecStatut {
  const r = calculerStatutContribution({
    baremes,
    contributions: m.contributions,
    anneeAdhesion: m.anneeAdhesion,
    anneeFinContribution: m.anneeFinContribution ?? null,
    anneeCourante,
  })
  return {
    id: m.id,
    nom: m.nom,
    prenom: m.prenom,
    sexe: m.sexe ?? null,
    statut: m.statut,
    telephone: m.telephone ?? null,
    brancheId: m.brancheId ?? null,
    branche: m.branche ?? null,
    anneeAdhesion: m.anneeAdhesion,
    anneeFinContribution: m.anneeFinContribution ?? null,
    statutCotisation: r.statut,
    totalAttenduCumule: r.totalAttenduCumule,
    totalValoriseCumule: r.totalValoriseCumule,
  }
}

export type ColonneTriMembre = 'nom' | 'branche' | 'statut' | 'cotisation' | 'adhesion'

// Ordres de tri des statuts CALCULÉS (miroir exact du front `MembresPage`) : c'est parce que le
// statut de cotisation n'est pas une colonne DB triable qu'on trie ici, en mémoire, sur l'ensemble.
const ORDRE_STATUT: Record<string, number> = { ACTIF: 0, INACTIF: 1, DECEDE: 2 }
const ORDRE_COTISATION: Record<string, number> = { A_JOUR: 0, PARTIEL: 1, NON_A_JOUR: 2 }

/** Synthèse (compteurs de tête) — calculée sur l'ensemble NON filtré (miroir de `lib/membres.ts`). */
export interface ResumeStatuts {
  total: number
  actifs: number
  aJour: number
  nonAJour: number
  inactifs: number
}

export interface OptionsStatutsPage {
  // `| undefined` explicite : le projet est en `exactOptionalPropertyTypes`, la route passe ces
  // champs directement depuis la querystring (souvent `undefined`).
  where?: Record<string, unknown> | undefined
  recherche?: string | undefined
  filtreBranche?: string | undefined
  filtreStatut?: StatutMembreValue | undefined
  filtreCotisation?: StatutContributionValue | undefined
  triCol?: ColonneTriMembre | undefined
  triDir?: 'asc' | 'desc' | undefined
  page: number
  pageSize: number
}

export interface StatutsMembresPageResultat {
  items: MembreAvecStatut[]
  /** Total APRÈS filtres (pilote la pagination). */
  total: number
  page: number
  pageSize: number
  /** Compteurs de tête — sur l'ensemble NON filtré (comme la page aujourd'hui). */
  resume: ResumeStatuts
  /** Toutes les branches présentes — options du filtre, indépendantes de la page. */
  branches: { id: string; nom: string }[]
}

/**
 * Pagination RÉELLE des membres (§1.3) — lève le plafond de 1000 pour les grosses organisations.
 *
 * Le statut de cotisation étant CALCULÉ (pas une colonne), on ne peut ni le trier ni le filtrer en
 * SQL : le serveur charge donc l'ensemble de l'org, calcule le statut, PUIS applique recherche,
 * filtres et tri EN MÉMOIRE, et ne renvoie que la page demandée + la synthèse (sur l'ensemble non
 * filtré) + les branches. Le coût est un recalcul par changement de page — acceptable jusqu'à
 * quelques milliers de membres ; au-delà, matérialiser le statut (colonnes cache) serait la suite.
 * `resume` et `branches` sont calculés AVANT le filtrage : ils décrivent toujours l'org entière.
 */
export async function calculerStatutsMembresPage(
  prisma: MembreStatutPrisma,
  anneeCourante: number,
  options: OptionsStatutsPage,
): Promise<StatutsMembresPageResultat> {
  const { where, page, pageSize } = options
  const [baremes, membresBruts] = await Promise.all([
    prisma.baremeAnnuel.findMany({ select: { annee: true, montantAttendu: true } }),
    prisma.membre.findMany({
      where,
      // Tri DB stable par défaut (nom/prénom) ; le tri applicatif s'applique ensuite si demandé.
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      select: {
        id: true,
        nom: true,
        prenom: true,
        sexe: true,
        statut: true,
        telephone: true,
        brancheId: true,
        branche: { select: { id: true, nom: true } },
        anneeAdhesion: true,
        anneeFinContribution: true,
        contributions: { select: { annee: true, montantValorise: true } },
      },
    }),
  ])

  const tous = membresBruts.map((m) => construireMembreAvecStatut(m, baremes, anneeCourante))

  // Synthèse + branches : sur l'ENSEMBLE (avant filtres) — ils décrivent l'org, pas la vue courante.
  const actifs = tous.filter((m) => m.statut === 'ACTIF')
  const resume: ResumeStatuts = {
    total: tous.length,
    actifs: actifs.length,
    aJour: actifs.filter((m) => m.statutCotisation === 'A_JOUR').length,
    nonAJour: actifs.filter((m) => m.statutCotisation === 'NON_A_JOUR').length,
    inactifs: tous.filter((m) => m.statut !== 'ACTIF').length,
  }
  const branchesMap = new Map<string, string>()
  for (const m of tous) if (m.branche) branchesMap.set(m.branche.id, m.branche.nom)
  const branches = [...branchesMap.entries()]
    .map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom))

  // Filtres (miroir exact de `MembresPage`) : recherche nom/prénom, branche, statut, cotisation.
  const q = options.recherche?.trim().toLowerCase() ?? ''
  const filtres = tous.filter((m) => {
    if (q && !`${m.nom} ${m.prenom}`.toLowerCase().includes(q)) return false
    if (options.filtreBranche && m.brancheId !== options.filtreBranche) return false
    if (options.filtreStatut && m.statut !== options.filtreStatut) return false
    if (options.filtreCotisation && m.statutCotisation !== options.filtreCotisation) return false
    return true
  })

  // Tri applicatif (miroir de `MembresPage`) — sur les statuts calculés quand demandé.
  const triCol = options.triCol ?? 'nom'
  const cmp = (a: MembreAvecStatut, b: MembreAvecStatut): number => {
    switch (triCol) {
      case 'branche':
        return (a.branche?.nom ?? '').localeCompare(b.branche?.nom ?? '')
      case 'statut':
        return (ORDRE_STATUT[a.statut] ?? 9) - (ORDRE_STATUT[b.statut] ?? 9)
      case 'cotisation':
        return (ORDRE_COTISATION[a.statutCotisation] ?? 9) - (ORDRE_COTISATION[b.statutCotisation] ?? 9)
      case 'adhesion':
        return a.anneeAdhesion - b.anneeAdhesion
      default:
        return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)
    }
  }
  const triees = [...filtres].sort(cmp)
  if (options.triDir === 'desc') triees.reverse()

  const skip = (page - 1) * pageSize
  return {
    items: triees.slice(skip, skip + pageSize),
    total: filtres.length,
    page,
    pageSize,
    resume,
    branches,
  }
}
