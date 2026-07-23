import cron from 'node-cron'
import type { FastifyInstance } from 'fastify'
import { orgContext } from '../lib/org-context'
import { confirmerPaiement, type PaiementDeps } from './paiement.service'

/**
 * RÉCONCILIATION des paiements en ligne (§ paiement) — filet de sécurité du webhook.
 *
 * La confirmation dépend d'un webhook Fapshi ; or un webhook se PERD (jamais émis, timeout, endpoint
 * momentanément down). Sans filet, un paiement réussi resterait `EN_ATTENTE` pour toujours : argent
 * reçu, versement jamais tracé — inacceptable sur un produit de transparence financière. Ce job
 * repasse périodiquement les `Paiement` `EN_ATTENTE` un peu anciens et **re-vérifie leur statut**
 * auprès du PSP (même chemin que le webhook, `confirmerPaiement`), rendant le webhook NON critique.
 *
 * Cœur découplé du cron (org par org, `now`/seuil injectés) → testable sans horloge ni timer.
 *
 * MULTI-INSTANCE — SÛR SANS VERROU : `confirmerPaiement` est idempotent (garde de statut +
 * `Versement.idempotenceKey` unique par org). Deux instances qui réconcilient le même paiement au
 * même moment ne peuvent pas doubler le versement (P2002 → on retombe sur l'existant). On accepte le
 * léger surcoût d'un double appel `verifierStatut` plutôt que d'introduire un verrou (qui se
 * heurterait à la transaction interne de `confirmerPaiement`).
 */

const AGE_MIN_MINUTES = 10 // laisser au webhook le temps d'agir d'abord
const INTERVALLE_CRON = '*/15 * * * *' // toutes les 15 minutes

/** Réconcilie les `EN_ATTENTE` d'UNE org (contexte déjà posé par l'appelant). Renvoie le nb confirmés. */
export async function reconcilierPaiementsOrg(deps: PaiementDeps, seuil: Date): Promise<number> {
  const enAttente = await deps.prisma.paiement.findMany({
    where: { statut: 'EN_ATTENTE', createdAt: { lt: seuil } },
    select: { id: true },
  })
  let confirmes = 0
  for (const p of enAttente as { id: string }[]) {
    try {
      const action = await confirmerPaiement(deps, p.id)
      if (action === 'CREER_VERSEMENT') confirmes += 1
    } catch {
      /* best-effort par paiement : un échec n'interrompt pas la boucle */
    }
  }
  return confirmes
}

export interface ReconciliationOrgResult {
  organisationId: string
  confirmes: number
}

/**
 * Réconcilie TOUTES les organisations actives — chacune DANS son contexte d'isolation (jamais un
 * `runUnscoped` global qui mélangerait les tenants), sur le modèle du scheduler de notifications.
 */
export async function reconcilierPaiementsToutesOrgs(
  deps: PaiementDeps,
  now: Date = new Date(),
  ageMinutes: number = AGE_MIN_MINUTES,
): Promise<ReconciliationOrgResult[]> {
  const seuil = new Date(now.getTime() - ageMinutes * 60_000)
  const orgs = (await deps.prisma.organisation.findMany({
    where: { actif: true },
    select: { id: true },
  })) as { id: string }[]
  const resultats: ReconciliationOrgResult[] = []
  for (const org of orgs) {
    const confirmes = await orgContext.run({ organisationId: org.id }, async () =>
      reconcilierPaiementsOrg(deps, seuil),
    )
    resultats.push({ organisationId: org.id, confirmes })
  }
  return resultats
}

/**
 * Enregistre le cron de réconciliation (toutes les 15 min). À appeler UNE FOIS au bootstrap serveur
 * (jamais par buildApp → aucun timer en test).
 */
export function demarrerSchedulerReconciliation(app: FastifyInstance): void {
  cron.schedule(
    INTERVALLE_CRON,
    () => {
      void reconcilierPaiementsToutesOrgs({ prisma: app.prisma, psp: app.psp })
        .then((resultats) => {
          const confirmes = resultats.reduce((s, r) => s + r.confirmes, 0)
          if (confirmes > 0) {
            app.log.info({ organisations: resultats.length, confirmes }, 'Réconciliation paiements : confirmations rattrapées')
          }
        })
        .catch((err) => {
          app.log.error({ err }, 'Réconciliation des paiements échouée')
          app.observabilite.signaler(err instanceof Error ? err : new Error(String(err)), {
            source: 'scheduler',
            tache: 'RECONCILIATION_PAIEMENT',
          })
        })
    },
    { timezone: 'Africa/Douala' },
  )
  app.log.info('Scheduler réconciliation paiements démarré (toutes les 15 min)')
}
