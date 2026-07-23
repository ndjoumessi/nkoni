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
  actif: boolean
}

/** Extrait l'environnement (méta non secrète) du blob chiffré — `null` si illisible. */
function environnementDe(identifiantsChiffres: string): EnvironnementPsp | null {
  try {
    const ids = JSON.parse(dechiffrerSecret(identifiantsChiffres)) as Record<string, unknown>
    return ids['environnement'] === 'SANDBOX' || ids['environnement'] === 'LIVE'
      ? (ids['environnement'] as EnvironnementPsp)
      : null
  } catch {
    return null
  }
}

/** Config paiement de l'org courante (scopée) — sans jamais exposer le secret. */
export async function lireConfigPaiement(prisma: PrismaParametrePaiement): Promise<VueConfigPaiement> {
  const p = await prisma.parametrePaiement.findFirst({})
  if (!p) return { configure: false, provider: null, environnement: null, actif: false }
  return {
    configure: true,
    provider: p.provider as PspProviderCode,
    environnement: environnementDe(p.identifiantsChiffres),
    actif: Boolean(p.actif),
  }
}

/** Enregistre (crée ou remplace) la config paiement de l'org courante. Chiffre les identifiants. */
export async function enregistrerConfigPaiement(
  prisma: PrismaParametrePaiement,
  input: { provider: PspProviderCode; identifiants: Record<string, unknown>; actif: boolean },
): Promise<VueConfigPaiement> {
  if (!chiffrementPspDisponible()) throw new ChiffrementIndisponibleError()
  const err = validerIdentifiants(input.provider, input.identifiants)
  if (err) throw new IdentifiantsInvalidesError(err)

  const identifiantsChiffres = chiffrerSecret(JSON.stringify(input.identifiants))
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
  return lireConfigPaiement(prisma)
}
