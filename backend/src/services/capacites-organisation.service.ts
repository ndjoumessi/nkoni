/**
 * Capacités APPLIQUÉES d'une organisation (spec 1.1 §3.3, étape 3) — point unique lu par les routes
 * documents, paiement et `GET /organisations/moi`. Toujours le forfait EFFECTIF (un Pro expiré au-delà
 * de la grâce retrouve les capacités Gratuit) ; le paiement en ligne tient compte du droit acquis.
 *
 * ⚠️ Ne JAMAIS appeler ceci depuis la CONFIRMATION d'un paiement (webhooks, réconciliation,
 * `confirmerPaiement`) : un membre qui a payé doit voir son versement enregistré même si l'abonnement
 * a expiré entre le démarrage et la confirmation. Seul le DÉMARRAGE d'un paiement est soumis au forfait.
 */
import {
  CAPACITES_FORFAIT,
  capacitesEffectives,
  forfaitEffectif,
  paiementEnLigneAutorise,
  type CapacitesForfait,
  type Forfait,
} from '../lib/forfait'

export interface CapacitesOrganisation {
  forfaitEffectif: Forfait
  capacites: Readonly<CapacitesForfait>
  paiementEnLigneAcquis: boolean
  /** Paiement en ligne permis (capacité effective OU droit acquis). */
  paiementEnLigneInclus: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** `Organisation` n'est PAS scopée : lecture par id, sans contexte. */
export interface CapacitesPrisma {
  organisation: { findUnique(args: any): Promise<any> }
}
/** `Document` est scopé : l'`aggregate` porte sur l'organisation EN CONTEXTE (extension d'isolation). */
export interface StockagePrisma {
  document: { aggregate(args: any): Promise<{ _sum: { tailleOctets: number | null } }> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function chargerCapacitesOrganisation(
  prisma: CapacitesPrisma,
  organisationId: string,
  now: Date = new Date(),
): Promise<CapacitesOrganisation | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { forfait: true, forfaitExpireLe: true, paiementEnLigneAcquis: true },
  })
  if (!org) return null
  const expireLe: Date | null = org.forfaitExpireLe ?? null
  const capacites = capacitesEffectives(org.forfait, expireLe, now)
  const acquis = Boolean(org.paiementEnLigneAcquis)
  return {
    forfaitEffectif: forfaitEffectif(org.forfait, expireLe, now),
    capacites,
    paiementEnLigneAcquis: acquis,
    paiementEnLigneInclus: paiementEnLigneAutorise(capacites, acquis),
  }
}

/**
 * Stockage consommé par l'organisation EN CONTEXTE : Σ `Document.tailleOctets`, agrégé côté Postgres
 * (sûr sur un modèle scopé, CLAUDE.md — ne pas rapatrier les lignes). Photos et reçus hors quota.
 */
export async function stockageUtiliseOctets(prisma: StockagePrisma): Promise<number> {
  const r = await prisma.document.aggregate({ _sum: { tailleOctets: true } })
  return r._sum.tailleOctets ?? 0
}

/** Levée quand un envoi ferait dépasser le quota de stockage du forfait effectif. */
export class QuotaStockageDepasseError extends Error {
  readonly utiliseOctets: number
  readonly quotaOctets: number
  constructor(utiliseOctets: number, quotaOctets: number) {
    super(`Quota de stockage dépassé (${utiliseOctets} / ${quotaOctets} octets).`)
    this.name = 'QuotaStockageDepasseError'
    this.utiliseOctets = utiliseOctets
    this.quotaOctets = quotaOctets
  }
}

/**
 * Refuse un envoi qui ferait dépasser le quota (limite INCLUSE : atteindre exactement le quota passe).
 * Organisation introuvable → quota GRATUIT : le plus restrictif, jamais d'ouverture par défaut.
 * Non atomique face à deux envois simultanés (dépassement borné à la taille d'un fichier, 10 Mo) :
 * assumé, le quota protège un coût, pas un invariant financier.
 */
export async function verifierQuotaStockage(
  prisma: CapacitesPrisma & StockagePrisma,
  organisationId: string,
  tailleAjoutOctets: number,
  now: Date = new Date(),
): Promise<void> {
  const capacites = await chargerCapacitesOrganisation(prisma, organisationId, now)
  const quota = (capacites?.capacites ?? CAPACITES_FORFAIT.GRATUIT).quotaStockageOctets
  const utilise = await stockageUtiliseOctets(prisma)
  if (utilise + tailleAjoutOctets > quota) throw new QuotaStockageDepasseError(utilise, quota)
}
