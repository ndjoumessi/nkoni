import { randomUUID } from 'node:crypto'
import { dechiffrerSecret } from '../lib/crypto-secret'
import { appliquerCreationVersement } from './versement.service'
import { genererRecu } from './recu.service'
import type { PspClient, StatutPaiementResolu } from './psp.service'

/**
 * Orchestration du PAIEMENT EN LIGNE (§ paiement) — flux « argent direct à l'org ».
 *
 *  1. `demarrerPaiement` : le membre lance le règlement d'une contribution → on charge la config PSP
 *     de SON org, on déchiffre ses identifiants (AAD = organisationId), on appelle `initierCollecte`
 *     (checkout hébergé Fapshi) et on trace un `Paiement` EN_ATTENTE. Renvoie l'URL de redirection.
 *  2. `confirmerPaiement` : déclenché par le webhook → on RE-VÉRIFIE le statut auprès du PSP (jamais
 *     le corps du webhook, non signé), et sur REUSSI on crée le `Versement` (invariant §5 réutilisé)
 *     de façon IDEMPOTENTE (clé = referenceExterne), puis un reçu (best-effort). Tourne SOUS le
 *     contexte org (posé par la route depuis l'org du Paiement).
 *
 * Surface Prisma typée en `any` (mockable, compile avant regen — pattern maison).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PaiementDeps {
  prisma: any
  psp: PspClient
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class ConfigPaiementIndisponibleError extends Error {
  constructor() {
    super('Paiement en ligne non configuré ou inactif pour cette organisation.')
    this.name = 'ConfigPaiementIndisponibleError'
  }
}
export class MontantInvalideError extends Error {
  constructor() {
    super('Montant de paiement invalide (minimum 100 XAF).')
    this.name = 'MontantInvalideError'
  }
}
export class ContributionIntrouvableError extends Error {
  constructor() {
    super('Contribution introuvable pour ce membre.')
    this.name = 'ContributionIntrouvableError'
  }
}
export class MontantSuperieurAuResteError extends Error {
  constructor(public readonly reste: number) {
    super(`Montant supérieur au reste dû (${reste} XAF).`)
    this.name = 'MontantSuperieurAuResteError'
  }
}

const MONTANT_MIN = 100 // minimum Fapshi (XAF)

/**
 * Décision de transition PURE (testable sans DB) : que faire d'un Paiement selon son statut ACTUEL
 * et le statut RÉSOLU auprès du PSP. Idempotent par construction — un Paiement déjà REUSSI ne
 * recrée jamais de versement.
 */
export type ActionPaiement = 'CREER_VERSEMENT' | 'MARQUER_ECHEC' | 'MARQUER_EXPIRE' | 'RIEN'

export function prochaineAction(statutActuel: string, statutResolu: StatutPaiementResolu): ActionPaiement {
  if (statutActuel !== 'EN_ATTENTE') return 'RIEN' // déjà tranché (REUSSI/ECHEC/EXPIRE) → idempotent
  switch (statutResolu) {
    case 'REUSSI':
      return 'CREER_VERSEMENT'
    case 'ECHEC':
      return 'MARQUER_ECHEC'
    case 'EXPIRE':
      return 'MARQUER_EXPIRE'
    default:
      return 'RIEN' // toujours en attente → on ne fait rien (un prochain webhook/poll tranchera)
  }
}

/** Déchiffre les identifiants PSP de la config (AAD = organisationId). */
function credsDeConfig(config: { provider: string; identifiantsChiffres: string }, organisationId: string) {
  const identifiants = JSON.parse(dechiffrerSecret(config.identifiantsChiffres, organisationId)) as Record<string, string>
  return { provider: config.provider as 'FAPSHI' | 'CAMPAY', identifiants }
}

export async function demarrerPaiement(
  deps: PaiementDeps,
  params: {
    organisationId: string
    membreId: string
    contributionId: string
    montant: number
    description: string
    redirectUrl?: string
  },
): Promise<{ paiementId: string; urlPaiement?: string }> {
  const { prisma, psp } = deps
  if (!Number.isInteger(params.montant) || params.montant < MONTANT_MIN) throw new MontantInvalideError()

  const config = await prisma.parametrePaiement.findFirst({})
  if (!config || !config.actif) throw new ConfigPaiementIndisponibleError()

  // La contribution doit appartenir au membre (lecture scopée → isolation tenant en plus).
  const contribution = await prisma.contribution.findFirst({
    where: { id: params.contributionId, membreId: params.membreId },
    select: { id: true, montantAttendu: true, montantValorise: true },
  })
  if (!contribution) throw new ContributionIntrouvableError()

  // Plafond SERVEUR au reste dû (attendu − valorisé) : ne JAMAIS se fier au montant du client. Sans
  // ça, une requête forgée pourrait sur-payer une cotisation. On relâchera si l'avance est un jour voulue.
  const reste = Math.max(0, contribution.montantAttendu - contribution.montantValorise)
  if (params.montant > reste) throw new MontantSuperieurAuResteError(reste)

  const creds = credsDeConfig(config, params.organisationId)
  const ref = randomUUID() // externalId Fapshi (réconciliation) — la clé locale reste le transId
  const res = await psp.initierCollecte(creds, {
    montant: params.montant,
    reference: ref,
    description: params.description,
    ...(params.redirectUrl ? { redirectUrl: params.redirectUrl } : {}),
  })

  // Créé APRÈS l'appel PSP : si le PSP échoue, aucun Paiement fantôme ; et le membre ne reçoit le lien
  // (donc ne peut payer) que si tout a réussi. FK scalaires (écriture scopée, org injectée par l'extension).
  const paiement = await prisma.paiement.create({
    data: {
      membreId: params.membreId,
      contributionId: params.contributionId,
      montant: params.montant,
      provider: config.provider,
      referenceExterne: res.referenceExterne,
      statut: 'EN_ATTENTE',
    },
  })
  return { paiementId: paiement.id, ...(res.urlPaiement ? { urlPaiement: res.urlPaiement } : {}) }
}

/**
 * Confirme (ou classe) un Paiement à partir du PSP. À appeler SOUS le contexte org du Paiement
 * (posé par la route webhook via `orgContext.run`). Idempotent. Renvoie l'action effectuée.
 */
export async function confirmerPaiement(deps: PaiementDeps, paiementId: string): Promise<ActionPaiement> {
  const { prisma, psp } = deps
  const paiement = await prisma.paiement.findFirst({
    where: { id: paiementId },
    select: {
      id: true, organisationId: true, statut: true, referenceExterne: true, montant: true,
      contributionId: true, provider: true,
      membre: { select: { compteUtilisateurId: true } },
    },
  })
  if (!paiement) return 'RIEN'
  if (paiement.statut !== 'EN_ATTENTE') return 'RIEN' // déjà tranché → idempotent

  const config = await prisma.parametrePaiement.findFirst({})
  if (!config) return 'RIEN'
  const creds = credsDeConfig(config, paiement.organisationId)

  const statutResolu = await psp.verifierStatut(creds, paiement.referenceExterne)
  const action = prochaineAction(paiement.statut, statutResolu)

  if (action === 'MARQUER_ECHEC' || action === 'MARQUER_EXPIRE') {
    await prisma.paiement.update({
      where: { id: paiement.id },
      data: { statut: action === 'MARQUER_ECHEC' ? 'ECHEC' : 'EXPIRE' },
    })
    return action
  }
  if (action !== 'CREER_VERSEMENT') return 'RIEN'

  // REUSSI : créer le Versement (invariant §5) + lier le Paiement, dans UNE transaction. Idempotence
  // dure = `Versement.idempotenceKey = referenceExterne` (unique par org) : un webhook rejoué ou
  // concurrent ne peut pas doubler le versement (P2002 → on retombe sur l'existant).
  await prisma.$transaction(async (tx: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any
    let versementId: string
    try {
      const { versement } = await appliquerCreationVersement(t, {
        contributionId: paiement.contributionId,
        montant: paiement.montant,
        dateVersement: new Date(),
        mode: 'AUTRE',
        note: 'Paiement en ligne',
        idempotenceKey: paiement.referenceExterne,
      })
      versementId = versement.id
    } catch (err) {
      // Rejeu concurrent : le versement existe déjà (même idempotenceKey) → on le retrouve.
      const existant = await t.versement.findFirst({
        where: { idempotenceKey: paiement.referenceExterne },
        select: { id: true },
      })
      if (!existant) throw err
      versementId = existant.id
    }
    await t.paiement.update({ where: { id: paiement.id }, data: { statut: 'REUSSI', versementId } })
  })

  // Reçu — BEST-EFFORT (ne fait jamais échouer la confirmation ; l'argent est déjà tracé). Généré au
  // nom du compte du membre payeur si disponible.
  const genereParId = paiement.membre?.compteUtilisateurId
  if (genereParId) {
    const lie = await prisma.paiement.findFirst({ where: { id: paiement.id }, select: { versementId: true } })
    if (lie?.versementId) {
      try {
        await genererRecu(prisma, lie.versementId, genereParId)
      } catch {
        /* reçu émis plus tard manuellement — le versement, lui, est enregistré */
      }
    }
  }
  return 'CREER_VERSEMENT'
}
