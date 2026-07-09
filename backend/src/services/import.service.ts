import { Prisma } from '../generated/prisma/client'
import type { CreationScopee } from '../lib/tenant-extension'

/**
 * Import en masse de membres (CSV/Excel) — §5.2 (réutilise le modèle `Membre`, aucune migration).
 *
 * Ce service est **i18n-agnostique** : il valide chaque ligne et renvoie des ERREURS TYPÉES
 * (code + champ + données), jamais de texte traduit. La route mappe chaque code → `t(langue, …)`
 * à la frontière HTTP (cf. CLAUDE.md « traduction des erreurs par TYPE d'erreur »).
 *
 * Deux temps :
 *   1. `analyserImport` (lecture seule) : valide, résout les branches, détecte les doublons,
 *      vérifie le quota. Renvoie un RAPPORT (aperçu) + le jeu de lignes prêtes à écrire.
 *   2. `executerImport` (écriture) : dans une transaction, crée les branches manquantes puis
 *      les membres via `createMany` en **FK SCALAIRES** (organisationId injecté par l'extension
 *      d'isolation — jamais de forme `{ connect }`, cf. CLAUDE.md).
 */

export type StatutMembreImport = 'ACTIF' | 'INACTIF' | 'DECEDE'
const STATUTS: readonly StatutMembreImport[] = ['ACTIF', 'INACTIF', 'DECEDE']
const STATUTS_FIN_CONTRIBUTION: readonly StatutMembreImport[] = ['DECEDE', 'INACTIF']

/** Une ligne brute du fichier (les nombres peuvent arriver en chaîne selon le parseur). */
export interface LigneImport {
  nom?: string
  prenom?: string
  anneeAdhesion?: number | string
  sexe?: string
  dateNaissance?: string
  telephone?: string
  adresse?: string
  fonctionSociale?: string
  statut?: string
  anneeFinContribution?: number | string
  dateDeces?: string
  branche?: string
}

/** Codes d'erreur TYPÉS (traduits par la route via `import.erreur.<code>`). */
export type CodeErreurImport =
  | 'nomRequis'
  | 'prenomRequis'
  | 'anneeRequise'
  | 'anneeInvalide'
  | 'anneeFuture'
  | 'statutInvalide'
  | 'anneeFinInvalide'
  | 'dateInvalide'
  | 'brancheInconnue'

export interface ErreurLigneImport {
  /** Index 1-based de la ligne de DONNÉES (hors en-tête). */
  ligne: number
  /** Champ concerné (nom du champ Membre). */
  champ: string
  code: CodeErreurImport
}

export interface DoublonImport {
  ligne: number
  nom: string
  prenom: string
}

/** Rapport d'aperçu (renvoyé tel quel en mode `valider`, après traduction des erreurs). */
export interface RapportImport {
  /** Nombre de lignes qui SERONT créées (sans erreur et non-doublon). */
  valides: number
  doublons: DoublonImport[]
  erreurs: ErreurLigneImport[]
  quota: { actuel: number; plafond: number; aCreer: number; depasse: boolean }
}

/** Données scalaires prêtes pour `createMany` (organisationId injecté par l'extension). */
type MembreCreateData = CreationScopee<Prisma.MembreUncheckedCreateInput>

export interface AnalyseImport {
  rapport: RapportImport
  /** Lignes prêtes à écrire (brancheId résolu ; `__brancheACreer` porté pour les branches à créer). */
  aCreer: (MembreCreateData & { __brancheACreer?: string })[]
  /** Noms de branches à créer (casse d'origine, dédupliqués) si `creerBranchesManquantes`. */
  branchesACreer: string[]
}

export interface OptionsImport {
  creerBranchesManquantes: boolean
  /** Année de référence (injectée pour testabilité sans horloge réelle). */
  anneeCourante: number
  /** Plafond de membres du plan gratuit. */
  plafond: number
}

/** Surface Prisma minimale utilisée (mockable en test). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ImportPrisma {
  membre: {
    count(args?: any): Promise<number>
    findMany(args?: any): Promise<any[]>
    createMany(args: any): Promise<{ count: number }>
  }
  brancheFamiliale: {
    findMany(args?: any): Promise<any[]>
    create(args: any): Promise<any>
  }
  $transaction<T>(fn: (tx: ImportPrisma) => Promise<T>): Promise<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function estVide(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/** Coerce une année (nombre ou chaîne) en entier, ou `null` si non entière. */
function parseAnnee(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isInteger(n) ? n : null
}

/** Valide une date `YYYY-MM-DD` (ou ISO) ; renvoie l'objet Date, ou `null` si invalide. */
function parseDate(v: string | undefined): Date | null {
  if (estVide(v)) return null
  const d = new Date(String(v).trim())
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Analyse (lecture seule) un lot de lignes : validation, résolution de branche, détection de
 * doublons (contre l'existant ET au sein du fichier), contrôle de quota. N'écrit RIEN.
 */
export async function analyserImport(
  prisma: ImportPrisma,
  lignes: LigneImport[],
  opts: OptionsImport,
): Promise<AnalyseImport> {
  // Branches existantes de l'org (résolution insensible à la casse).
  const branches = await prisma.brancheFamiliale.findMany({ select: { id: true, nom: true } })
  const brancheParNom = new Map<string, string>()
  for (const b of branches) brancheParNom.set(String(b.nom).trim().toLowerCase(), b.id)

  // Membres existants pour la détection de doublons (clé nom|prenom insensible à la casse).
  const existants = await prisma.membre.findMany({ select: { nom: true, prenom: true } })
  const clesVues = new Set<string>()
  for (const m of existants) clesVues.add(cleMembre(m.nom, m.prenom))

  const erreurs: ErreurLigneImport[] = []
  const doublons: DoublonImport[] = []
  const aCreer: (MembreCreateData & { __brancheACreer?: string })[] = []
  const branchesACreer = new Map<string, string>() // clé minuscule → nom d'origine

  lignes.forEach((brut, i) => {
    const ligne = i + 1
    const erreursLigne = validerLigne(brut, ligne, opts, brancheParNom)
    if (erreursLigne.erreurs.length > 0) {
      erreurs.push(...erreursLigne.erreurs)
      return
    }
    const data = erreursLigne.data!
    const cle = cleMembre(data.nom, data.prenom)
    if (clesVues.has(cle)) {
      doublons.push({ ligne, nom: data.nom, prenom: data.prenom })
      return
    }
    clesVues.add(cle)
    // Branche à créer (inconnue + option activée) → mémorisée pour le commit.
    if (erreursLigne.brancheACreer) {
      const k = erreursLigne.brancheACreer.toLowerCase()
      if (!branchesACreer.has(k)) branchesACreer.set(k, erreursLigne.brancheACreer)
      aCreer.push({ ...data, __brancheACreer: erreursLigne.brancheACreer })
    } else {
      aCreer.push(data)
    }
  })

  const actuel = await prisma.membre.count()
  const aCreerCount = aCreer.length
  const depasse = actuel + aCreerCount > opts.plafond

  return {
    rapport: {
      valides: aCreerCount,
      doublons,
      erreurs,
      quota: { actuel, plafond: opts.plafond, aCreer: aCreerCount, depasse },
    },
    aCreer,
    branchesACreer: [...branchesACreer.values()],
  }
}

/**
 * Écrit l'import (transactionnel) : crée d'abord les branches manquantes (si demandé), puis les
 * membres via `createMany` en FK scalaires. À n'appeler QUE si l'analyse n'a ni erreur ni
 * dépassement de quota (garanti par la route). Renvoie le nombre de membres créés.
 */
export async function executerImport(
  prisma: ImportPrisma,
  analyse: AnalyseImport,
): Promise<{ crees: number; ignores: number }> {
  const crees = await prisma.$transaction(async (tx) => {
    // 1. Branches manquantes → création scalaire (organisationId injecté), récupération des ids.
    const idParBranche = new Map<string, string>()
    for (const nom of analyse.branchesACreer) {
      const branche = await tx.brancheFamiliale.create({ data: { nom } })
      idParBranche.set(nom.toLowerCase(), branche.id)
    }

    // 2. Résolution des brancheId différés, puis createMany en une seule opération scalaire.
    const data = analyse.aCreer.map((m) => {
      const { __brancheACreer, ...reste } = m
      if (__brancheACreer) {
        const id = idParBranche.get(__brancheACreer.toLowerCase())
        if (id) reste.brancheId = id
      }
      return reste
    })
    if (data.length === 0) return 0
    const res = await tx.membre.createMany({ data: data as Prisma.MembreUncheckedCreateInput[] })
    return res.count
  })
  return { crees, ignores: analyse.rapport.doublons.length }
}

/* -------------------------------------------------------------------------- */
/* Validation d'une ligne                                                     */
/* -------------------------------------------------------------------------- */

interface ResultatLigne {
  erreurs: ErreurLigneImport[]
  data?: MembreCreateData & { nom: string; prenom: string }
  /** Nom (casse d'origine) d'une branche inconnue à créer (option activée). */
  brancheACreer?: string
}

function validerLigne(
  brut: LigneImport,
  ligne: number,
  opts: OptionsImport,
  brancheParNom: Map<string, string>,
): ResultatLigne {
  const erreurs: ErreurLigneImport[] = []
  const err = (champ: string, code: CodeErreurImport) => erreurs.push({ ligne, champ, code })

  const nom = (brut.nom ?? '').trim()
  const prenom = (brut.prenom ?? '').trim()
  if (nom === '') err('nom', 'nomRequis')
  if (prenom === '') err('prenom', 'prenomRequis')

  // anneeAdhesion : requise, entière, dans [1900, 2200], non future.
  const anneeAdhesion = parseAnnee(brut.anneeAdhesion)
  if (estVide(brut.anneeAdhesion)) {
    err('anneeAdhesion', 'anneeRequise')
  } else if (anneeAdhesion === null || anneeAdhesion < 1900 || anneeAdhesion > 2200) {
    err('anneeAdhesion', 'anneeInvalide')
  } else if (anneeAdhesion > opts.anneeCourante) {
    err('anneeAdhesion', 'anneeFuture')
  }

  // statut (optionnel) : dans l'enum.
  let statut: StatutMembreImport | undefined
  if (!estVide(brut.statut)) {
    const s = String(brut.statut).trim().toUpperCase()
    if ((STATUTS as readonly string[]).includes(s)) statut = s as StatutMembreImport
    else err('statut', 'statutInvalide')
  }

  // anneeFinContribution (optionnel) : entière dans [1900, 2200].
  let anneeFin: number | undefined
  if (!estVide(brut.anneeFinContribution)) {
    const a = parseAnnee(brut.anneeFinContribution)
    if (a === null || a < 1900 || a > 2200) err('anneeFinContribution', 'anneeFinInvalide')
    else anneeFin = a
  }

  // Dates (optionnelles) : format valide si fourni.
  const dateNaissance = brut.dateNaissance
  let dateNaissanceObj: Date | undefined
  if (!estVide(dateNaissance)) {
    const d = parseDate(dateNaissance)
    if (d === null) err('dateNaissance', 'dateInvalide')
    else dateNaissanceObj = d
  }
  const dateDeces = brut.dateDeces
  let dateDecesObj: Date | undefined
  if (!estVide(dateDeces)) {
    const d = parseDate(dateDeces)
    if (d === null) err('dateDeces', 'dateInvalide')
    else dateDecesObj = d
  }

  // Branche (optionnel) : résolue par nom insensible à la casse.
  let brancheId: string | undefined
  let brancheACreer: string | undefined
  if (!estVide(brut.branche)) {
    const nomBranche = String(brut.branche).trim()
    const id = brancheParNom.get(nomBranche.toLowerCase())
    if (id) brancheId = id
    else if (opts.creerBranchesManquantes) brancheACreer = nomBranche
    else err('branche', 'brancheInconnue')
  }

  if (erreurs.length > 0) return { erreurs }

  // Règle §4.1 : fin de contribution auto au passage DECEDE/INACTIF sans valeur explicite.
  let finEffective = anneeFin
  if (finEffective === undefined && statut !== undefined && STATUTS_FIN_CONTRIBUTION.includes(statut)) {
    finEffective = opts.anneeCourante
  }

  const data: MembreCreateData & { nom: string; prenom: string } = {
    nom,
    prenom,
    anneeAdhesion: anneeAdhesion!,
  }
  if (!estVide(brut.sexe)) data.sexe = String(brut.sexe).trim()
  if (!estVide(brut.telephone)) data.telephone = String(brut.telephone).trim()
  if (!estVide(brut.adresse)) data.adresse = String(brut.adresse).trim()
  if (!estVide(brut.fonctionSociale)) data.fonctionSociale = String(brut.fonctionSociale).trim()
  if (statut !== undefined) data.statut = statut
  if (dateNaissanceObj !== undefined) data.dateNaissance = dateNaissanceObj
  if (dateDecesObj !== undefined) data.dateDeces = dateDecesObj
  if (finEffective !== undefined) data.anneeFinContribution = finEffective
  if (brancheId !== undefined) data.brancheId = brancheId

  return { erreurs: [], data, ...(brancheACreer !== undefined ? { brancheACreer } : {}) }
}

function cleMembre(nom: string, prenom: string): string {
  return `${nom.trim().toLowerCase()}|${prenom.trim().toLowerCase()}`
}
