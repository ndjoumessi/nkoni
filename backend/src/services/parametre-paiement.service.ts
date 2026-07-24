import { chiffrerSecret, dechiffrerSecret, chiffrementPspDisponible } from '../lib/crypto-secret'
import { validerIdentifiants, type PspProviderCode, type EnvironnementPsp } from './psp.service'

/**
 * Config paiement PAR ORGANISATION (§ paiement) — lecture/écriture de `ParametrePaiement`. Les
 * identifiants du PSP sont des SECRETS DE TIERS : chiffrés au repos (AES-256-GCM) et JAMAIS renvoyés
 * au client. La vue de lecture n'expose que des méta NON sensibles (provider, environnement, actif).
 *
 * Surface Prisma typée en `any` mockable : compile avant `prisma generate` (le modèle n'existe dans
 * le client généré qu'après la migration) et se teste sans base — pattern maison.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PrismaParametrePaiement {
  parametrePaiement: {
    findFirst(args?: any): Promise<any>
    create(args: any): Promise<any>
    update(args: any): Promise<any>
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Erreurs typées (i18n-agnostiques) — la route les mappe à un message. */
export class ChiffrementIndisponibleError extends Error {
  constructor() {
    super('PSP_ENCRYPTION_KEY absente : configuration de paiement indisponible.')
    this.name = 'ChiffrementIndisponibleError'
  }
}
export class IdentifiantsInvalidesError extends Error {
  constructor(public readonly code: string) {
    super(`Identifiants PSP invalides : ${code}`)
    this.name = 'IdentifiantsInvalidesError'
  }
}

/** Vue SÛRE de la config (aucun secret) renvoyée au client. */
export interface VueConfigPaiement {
  configure: boolean
  provider: PspProviderCode | null
  environnement: EnvironnementPsp | null
  /**
   * Identifiant PUBLIC (non secret) du compte PSP configuré : `username` (CamPay) ou `apiUser` (Fapshi).
   * Sert à AFFICHER quel compte est branché (le mot de passe / la clé / le token restent, eux, secrets et
   * ne sont JAMAIS renvoyés). `null` si illisible ou absent.
   */
  identifiantPublic: string | null
  /** Date de dernière mise à jour de la config (ISO) — retour visuel « bien enregistré ». */
  misAJourLe: string | null
  actif: boolean
}

/** Méta NON secrètes lisibles depuis le blob chiffré (environnement + identifiant public). AAD = orgId. */
function metaDe(
  identifiantsChiffres: string,
  organisationId: string,
): { environnement: EnvironnementPsp | null; identifiantPublic: string | null } {
  try {
    const ids = JSON.parse(dechiffrerSecret(identifiantsChiffres, organisationId)) as Record<string, unknown>
    const environnement =
      ids['environnement'] === 'SANDBOX' || ids['environnement'] === 'LIVE'
        ? (ids['environnement'] as EnvironnementPsp)
        : null
    // Identifiant public = le champ non secret propre au provider (username CamPay, apiUser Fapshi).
    const brut = ids['username'] ?? ids['apiUser']
    const identifiantPublic = typeof brut === 'string' && brut.trim().length > 0 ? brut : null
    return { environnement, identifiantPublic }
  } catch {
    return { environnement: null, identifiantPublic: null }
  }
}

/**
 * Config paiement de l'org courante (scopée) — sans jamais exposer le secret. `organisationId` est
 * l'AAD du chiffrement : indispensable pour relire l'environnement, et il DOIT être celui du contexte
 * de requête (le même sous lequel `prisma` est scopé), sinon le déchiffrement échoue par construction.
 */
export async function lireConfigPaiement(
  prisma: PrismaParametrePaiement,
  organisationId: string,
): Promise<VueConfigPaiement> {
  const p = await prisma.parametrePaiement.findFirst({})
  if (!p) {
    return { configure: false, provider: null, environnement: null, identifiantPublic: null, misAJourLe: null, actif: false }
  }
  const { environnement, identifiantPublic } = metaDe(p.identifiantsChiffres, organisationId)
  return {
    configure: true,
    provider: p.provider as PspProviderCode,
    environnement,
    identifiantPublic,
    misAJourLe: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
    actif: Boolean(p.actif),
  }
}

/** Enregistre (crée ou remplace) la config paiement de l'org courante. Chiffre les identifiants (AAD = orgId). */
export async function enregistrerConfigPaiement(
  prisma: PrismaParametrePaiement,
  organisationId: string,
  input: { provider: PspProviderCode; identifiants: Record<string, unknown>; actif: boolean },
): Promise<VueConfigPaiement> {
  if (!chiffrementPspDisponible()) throw new ChiffrementIndisponibleError()
  const err = validerIdentifiants(input.provider, input.identifiants)
  if (err) throw new IdentifiantsInvalidesError(err)

  const identifiantsChiffres = chiffrerSecret(JSON.stringify(input.identifiants), organisationId)
  const existant = await prisma.parametrePaiement.findFirst({})
  if (existant) {
    // FK scalaire `organisationId` forcée par l'extension d'isolation (écriture scopée).
    await prisma.parametrePaiement.update({
      where: { id: existant.id },
      data: { provider: input.provider, identifiantsChiffres, actif: input.actif },
    })
  } else {
    await prisma.parametrePaiement.create({
      data: { provider: input.provider, identifiantsChiffres, actif: input.actif },
    })
  }
  return lireConfigPaiement(prisma, organisationId)
}
