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

import type { PageResultat } from '../lib/pagination'
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
 * ne l'approche ; au-delà, `tronque` le signale. La page Membres passe par la version paginée
 * (`calculerStatutsMembresPage`, non plafonnée) et les sélecteurs par `listerOptionsMembres`.
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
        contributions: { select: { annee: true, montantAttendu: true, montantValorise: true } },
      },
    }),
  ])

  const items = membres.map((m) => construireMembreAvecStatut(m, baremes, anneeCourante))
  return { items, total, tronque: limite != null && total > limite }
}

/* -------------------------------------------------------------------------- */
/* Options légères pour les sélecteurs (§1.3)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Plafond de `/membres/options`. Dix fois celui des statuts : une ligne ne porte que l'identité
 * (~100 octets), aucun calcul ne dépend du volume. `tronque` est renvoyé mais le front
 * (`membresApi.listOptions`) ne l'exploite pas : ce plafond est dix fois la cible à 12 mois
 * (décision PO 2026-09-14). Si une organisation l'approche, afficher le signal dans les sélecteurs.
 */
export const PLAFOND_OPTIONS_MEMBRES = 10_000

export interface OptionMembre {
  id: string
  nom: string
  prenom: string
  statut: StatutMembreValue
  branche: { id: string; nom: string } | null
}

export interface OptionsMembresResultat {
  items: OptionMembre[]
  total: number
  tronque: boolean
}

/**
 * Identité des membres pour les sélecteurs et la palette ⌘K, SANS statut de cotisation.
 * Ces écrans n'affichent qu'un nom à choisir : leur servir `calculerStatutsMembres` chargeait
 * toutes les contributions et recalculait chaque statut, et les bornait à 1000 — au-delà, les
 * derniers membres de l'ordre alphabétique disparaissaient des sélecteurs sans avertissement.
 * Le `select` ne doit donc jamais inclure `contributions` (verrou : `membres-options.route.test.ts`).
 */
export async function listerOptionsMembres(
  prisma: MembreStatutPrisma,
  where?: Record<string, unknown>,
): Promise<OptionsMembresResultat> {
  const [total, items] = await Promise.all([
    prisma.membre.count(where ? { where } : undefined),
    prisma.membre.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: PLAFOND_OPTIONS_MEMBRES,
      select: {
        id: true,
        nom: true,
        prenom: true,
        statut: true,
        branche: { select: { id: true, nom: true } },
      },
    }),
  ])
  return { items, total, tronque: total > PLAFOND_OPTIONS_MEMBRES }
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

/**
 * Filtre de cotisation de la liste : un statut précis, ou `A_RELANCER` = tout ce qui n'est pas à jour
 * (partiel OU non à jour). C'est l'ensemble que compte la carte « À relancer » du tableau de bord
 * (avec `statut=ACTIF`) : son lien « Voir tous » visait `NON_A_JOUR` seul et perdait les partiels.
 */
export type FiltreCotisation = StatutContributionValue | 'A_RELANCER'

export interface OptionsStatutsPage {
  // `| undefined` explicite : le projet est en `exactOptionalPropertyTypes`, la route passe ces
  // champs directement depuis la querystring (souvent `undefined`).
  where?: Record<string, unknown> | undefined
  recherche?: string | undefined
  filtreBranche?: string | undefined
  filtreStatut?: StatutMembreValue | undefined
  filtreCotisation?: FiltreCotisation | undefined
  triCol?: ColonneTriMembre | undefined
  triDir?: 'asc' | 'desc' | undefined
  page: number
  pageSize: number
}

export interface StatutsMembresPageResultat extends PageResultat<MembreAvecStatut> {
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
        contributions: { select: { annee: true, montantAttendu: true, montantValorise: true } },
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
    if (options.filtreCotisation === 'A_RELANCER') {
      if (m.statutCotisation === 'A_JOUR') return false
    } else if (options.filtreCotisation && m.statutCotisation !== options.filtreCotisation) {
      return false
    }
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

/* -------------------------------------------------------------------------- */
/* Analyse du tableau de bord (§1.3) — agrégée côté serveur, SANS plafond      */
/* -------------------------------------------------------------------------- */

/** Nombre de membres à relancer détaillés dans l'analyse (le reste n'est que compté). */
export const NB_RELANCES_ANALYSE = 6

export interface BrancheAnalyse {
  /** `null` = membres sans branche. */
  id: string | null
  nom: string | null
  attendu: number
  valorise: number
  /** Taux de recouvrement en %, plafonné à 100. */
  taux: number
}

export interface RelanceAnalyse {
  id: string
  nom: string
  prenom: string
  telephone: string | null
  branche: { id: string; nom: string } | null
  statutCotisation: 'PARTIEL' | 'NON_A_JOUR'
  /** Reste dû cumulé (attendu − valorisé), jamais négatif. */
  manque: number
}

export interface AnalyseMembres {
  /** Branches ayant un attendu, la plus en retard d'abord. */
  branches: BrancheAnalyse[]
  relance: { total: number; membres: RelanceAnalyse[] }
}

/**
 * Cœur PUR de l'analyse du tableau de bord : recouvrement par branche et membres à relancer (actifs
 * non à jour — « Non à jour » d'abord, puis le plus gros reste dû).
 *
 * Auparavant calculé DANS LE NAVIGATEUR à partir de `GET /membres/statuts`, réponse plafonnée à
 * 1000 membres : au-delà, l'analyse ne portait que sur les premiers de l'ordre alphabétique, et le
 * téléphone recevait le statut complet de chaque membre pour n'en afficher que six. Calculée ici sur
 * TOUTE l'organisation, la réponse garde une taille constante (quelques branches + six membres).
 */
export function analyserMembres(
  membres: MembreAvecStatut[],
  nbRelances = NB_RELANCES_ANALYSE,
): AnalyseMembres {
  const parBranche = new Map<string | null, BrancheAnalyse>()
  for (const m of membres) {
    const id = m.branche?.id ?? null
    const cur = parBranche.get(id) ?? { id, nom: m.branche?.nom ?? null, attendu: 0, valorise: 0, taux: 0 }
    cur.attendu += m.totalAttenduCumule
    cur.valorise += m.totalValoriseCumule
    parBranche.set(id, cur)
  }
  const branches = [...parBranche.values()]
    .filter((b) => b.attendu > 0)
    .map((b) => ({ ...b, taux: Math.min(100, (b.valorise / b.attendu) * 100) }))
    .sort((a, b) => a.taux - b.taux)

  const aRelancer = membres
    .filter(
      (m): m is MembreAvecStatut & { statutCotisation: 'PARTIEL' | 'NON_A_JOUR' } =>
        m.statut === 'ACTIF' && m.statutCotisation !== 'A_JOUR',
    )
    .map((m) => ({
      id: m.id,
      nom: m.nom,
      prenom: m.prenom,
      telephone: m.telephone,
      branche: m.branche,
      statutCotisation: m.statutCotisation,
      manque: Math.max(0, m.totalAttenduCumule - m.totalValoriseCumule),
    }))
    .sort((a, b) => {
      if (a.statutCotisation !== b.statutCotisation) return a.statutCotisation === 'NON_A_JOUR' ? -1 : 1
      return b.manque - a.manque
    })

  return { branches, relance: { total: aRelancer.length, membres: aRelancer.slice(0, nbRelances) } }
}

/** Analyse du tableau de bord sur TOUTE l'organisation (aucun plafond, cf. `analyserMembres`). */
export async function calculerAnalyseMembres(
  prisma: MembreStatutPrisma,
  anneeCourante: number,
  where?: Record<string, unknown>,
): Promise<AnalyseMembres> {
  const { items } = await calculerStatutsMembres(prisma, anneeCourante, where)
  return analyserMembres(items)
}
