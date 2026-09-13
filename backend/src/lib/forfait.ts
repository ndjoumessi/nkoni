/**
 * Forfaits commerciaux (SaaS §3.1, spec 1.1) — SOURCE UNIQUE des capacités par forfait (routes +
 * services + tests). Miroir côté front dans `frontend/src/lib/forfait.ts`, dont l'alignement est vérifié
 * par `frontend/src/lib/forfait-parity.test.ts` (lecture en texte des deux fichiers).
 *
 * L'attribution d'un forfait est une action PLATEFORME réservée au SUPER_ADMIN (activation manuelle
 * depuis la console, pas de paiement en ligne à ce stade).
 */
import { ajouterMoisApp, finDeJourneeApp, joursCalendairesEntreApp } from './date-app'

export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

// Unités BINAIRES, comme `TAILLE_MAX_IMAGE` (lib/upload-image.ts).
const MO = 1024 * 1024
const GO = 1024 * MO

export interface CapacitesForfait {
  /** Plafond de membres ACTIFS. `null` = illimité. */
  limiteMembres: number | null
  /** Quota de stockage des documents (Σ `Document.tailleOctets`). Consommé à l'étape 3 de la spec. */
  quotaStockageOctets: number
  /** Paiement en ligne Mobile Money disponible. Consommé à l'étape 3 de la spec. */
  paiementEnLigne: boolean
}

/**
 * Capacités par forfait. Modifier UNIQUEMENT ici (+ le miroir front, sinon le garde de parité casse).
 * Ne vendre ni la transparence envers les membres, ni rien de ce qu'ils voient (spec §1.1).
 */
export const CAPACITES_FORFAIT: Readonly<Record<Forfait, Readonly<CapacitesForfait>>> = {
  GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
  PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
  ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
}

/** Plafond de membres ACTIFS du forfait — DÉRIVÉ de `CAPACITES_FORFAIT` (appelants inchangés). */
export function limiteMembresForfait(forfait: Forfait): number | null {
  return CAPACITES_FORFAIT[forfait].limiteMembres
}

// ===========================================================================
// Échéance du forfait (spec 1.1 §2.3–§2.5) — état, forfait EFFECTIF et prolongation, tous CALCULÉS
// (jamais stockés ni rétrogradés par une tâche de nuit : une tâche en échec prolongerait l'accès en
// silence). Horloge `now` INJECTÉE partout. Une seule mesure du temps : les jours CALENDAIRES à Douala.
// ===========================================================================

/** État de l'échéance d'un forfait. */
export type EtatForfait = 'SANS_ECHEANCE' | 'ACTIF' | 'ECHEANCE_PROCHE' | 'GRACE' | 'EXPIRE'

/** Au plus ce nombre de jours avant l'échéance : « échéance proche ». */
export const JOURS_ECHEANCE_PROCHE = 30
/** Jours de grâce APRÈS l'échéance, capacités du forfait conservées. */
export const JOURS_GRACE = 14

/** Durées de prolongation proposées à l'opérateur (validées par la route). */
export const PERIODES_PROLONGATION = [1, 3, 6, 12] as const
export type PeriodeProlongation = (typeof PERIODES_PROLONGATION)[number]

/** Jours calendaires (Douala) jusqu'à l'échéance : 0 = dernier jour payé, négatif = échéance passée. */
export function joursRestants(expireLe: Date, now: Date): number {
  return joursCalendairesEntreApp(now, expireLe)
}

/** État de l'échéance. GRATUIT ou sans date → `SANS_ECHEANCE`. */
export function etatForfait(forfait: Forfait, expireLe: Date | null, now: Date): EtatForfait {
  if (forfait === 'GRATUIT' || expireLe === null) return 'SANS_ECHEANCE'
  const j = joursRestants(expireLe, now)
  if (j > JOURS_ECHEANCE_PROCHE) return 'ACTIF'
  if (j >= 0) return 'ECHEANCE_PROCHE'
  if (j >= -JOURS_GRACE) return 'GRACE'
  return 'EXPIRE'
}

/** Forfait dont les CAPACITÉS s'appliquent : GRATUIT une fois la grâce écoulée, sinon le forfait enregistré. */
export function forfaitEffectif(forfait: Forfait, expireLe: Date | null, now: Date): Forfait {
  return etatForfait(forfait, expireLe, now) === 'EXPIRE' ? 'GRATUIT' : forfait
}

/**
 * Nouvelle échéance après prolongation de `mois` mois. Base = l'ancienne échéance tant que la grâce
 * court (la grâce n'est pas du temps offert, payer en avance ne fait perdre aucun jour), sinon
 * aujourd'hui (échéance absente ou expirée).
 */
export function nouvelleEcheance(expireLe: Date | null, now: Date, mois: PeriodeProlongation): Date {
  const base = expireLe !== null && joursRestants(expireLe, now) >= -JOURS_GRACE ? expireLe : now
  return finDeJourneeApp(ajouterMoisApp(base, mois))
}

/** Valeurs d'échéance CALCULÉES renvoyées par l'API (le front les affiche sans les recalculer). */
export interface VueEcheance {
  forfaitExpireLe: Date | null
  etatForfait: EtatForfait
  /** `null` si `SANS_ECHEANCE`. */
  joursRestants: number | null
  /** Fin de la période de grâce (fin de journée Douala) ; `null` si `SANS_ECHEANCE`. */
  finGraceLe: Date | null
  forfaitEffectif: Forfait
}

export function vueEcheance(forfait: Forfait, expireLe: Date | null, now: Date): VueEcheance {
  const etat = etatForfait(forfait, expireLe, now)
  const avecEcheance = etat !== 'SANS_ECHEANCE' && expireLe !== null
  return {
    forfaitExpireLe: expireLe,
    etatForfait: etat,
    joursRestants: avecEcheance ? joursRestants(expireLe, now) : null,
    // Jours ENTIERS ajoutés à une fin de journée : Douala est à décalage fixe (UTC+1), la date reste
    // une fin de journée ; `finDeJourneeApp` renormalise par sécurité.
    finGraceLe: avecEcheance ? finDeJourneeApp(new Date(expireLe.getTime() + JOURS_GRACE * 86_400_000)) : null,
    forfaitEffectif: forfaitEffectif(forfait, expireLe, now),
  }
}

// ===========================================================================
// Relances d'échéance (spec 1.1 §4.1) — étape CALCULÉE, jamais mémorisée ailleurs que dans la clé de
// dédoublonnage des notifications.
// ===========================================================================

/** Étapes de relance : J-30, J-7, J-1, entrée en grâce. */
export type EtapeRelanceForfait = 'J30' | 'J7' | 'J1' | 'GRACE'

/**
 * Étape de relance la plus RÉCENTE atteinte, ou `null` (rien à envoyer). Renvoyer l'étape atteinte
 * plutôt que « le jour exact » rend une nuit manquée sans effet de rafale : la nuit suivante envoie
 * l'étape en cours, et seulement elle (les précédentes ne sont pas rattrapées).
 */
export function etapeRelanceForfait(
  forfait: Forfait,
  expireLe: Date | null,
  now: Date,
): EtapeRelanceForfait | null {
  const etat = etatForfait(forfait, expireLe, now)
  if (expireLe === null) return null
  if (etat === 'GRACE') return 'GRACE'
  if (etat !== 'ECHEANCE_PROCHE') return null
  const j = joursRestants(expireLe, now)
  if (j <= 1) return 'J1'
  if (j <= 7) return 'J7'
  return 'J30'
}
