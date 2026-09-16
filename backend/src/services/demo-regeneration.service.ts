import type { ObservabiliteClient } from '../lib/observabilite'
import type { BlobPurgeClient } from './organisation-purge.service'
import { genererOrganisationDemo, type OrganisationDemoGeneree } from './demo-generateur.service'
import { supprimerOrganisationDemo } from './demo-suppression.service'

/**
 * Espace de démonstration (spec 2026-09-15 §3.2) — régénération.
 *
 * Sans elle la démo vieillit (en janvier, « l'année courante » serait vide). Règle :
 *  - une démo ACTIVE de moins de 7 jours existe (et `forcer` n'est pas demandé) → rien à générer ;
 *  - sinon → générer la NOUVELLE d'abord, PUIS supprimer les autres : jamais de trou de service, un
 *    visiteur sur l'ancienne reçoit un 401/404 et le front redemande un jeton ;
 *  - dans les deux cas, les démos INACTIVES de plus d'une heure sont des générations interrompues
 *    (processus tué) : supprimées. Plus jeunes, elles peuvent être une génération EN COURS (commande
 *    manuelle pendant la nuit) : laissées.
 */

export const AGE_MAX_DEMO_JOURS = 7
export const DELAI_ORPHELINE_MS = 60 * 60 * 1000

export type ResultatRegeneration =
  | { statut: 'A_JOUR'; demoId: string; supprimees: string[] }
  | { statut: 'REGENEREE'; demoId: string; supprimees: string[] }

export interface OptionsRegeneration {
  now?: Date
  forcer?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generer?: (prisma: any, blob: BlobPurgeClient, now: Date) => Promise<OrganisationDemoGeneree>
}

export async function regenererDemo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  blob: BlobPurgeClient,
  options: OptionsRegeneration = {},
): Promise<ResultatRegeneration> {
  const now = options.now ?? new Date()
  const generer = options.generer ?? genererOrganisationDemo
  // `Organisation` n'est pas un modèle scopé : aucune lecture de tenant, aucun contexte requis. Liste
  // délibérément les DÉMOS (`estDemo: true`), comptée dans `demo-taches-de-fond.test.ts`.
  const demos: { id: string; actif: boolean; createdAt: Date }[] = await prisma.organisation.findMany({
    where: { estDemo: true },
    select: { id: true, actif: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const age = (d: { createdAt: Date }) => now.getTime() - d.createdAt.getTime()
  const orpheline = (d: { actif: boolean; createdAt: Date }) => !d.actif && age(d) > DELAI_ORPHELINE_MS

  const active = demos.find((d) => d.actif)
  if (active && !options.forcer && age(active) < AGE_MAX_DEMO_JOURS * 24 * 60 * 60 * 1000) {
    const supprimees: string[] = []
    for (const d of demos.filter(orpheline)) {
      await supprimerOrganisationDemo(prisma, blob, d.id)
      supprimees.push(d.id)
    }
    return { statut: 'A_JOUR', demoId: active.id, supprimees }
  }

  const { organisationId } = await generer(prisma, blob, now)
  const supprimees: string[] = []
  for (const d of demos) {
    if (d.id === organisationId || (!d.actif && !orpheline(d))) continue
    await supprimerOrganisationDemo(prisma, blob, d.id)
    supprimees.push(d.id)
  }
  return { statut: 'REGENEREE', demoId: organisationId, supprimees }
}

export interface EtapeDemoDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any
  blob: BlobPurgeClient
  demoActivee: boolean
  log: { info(obj: object, msg: string): void; error(obj: object, msg: string): void }
  observabilite: Pick<ObservabiliteClient, 'signaler'>
}

/**
 * Étape nocturne (après la rétention, sur l'instance qui détient le verrou). Éteinte sans
 * `DEMO_ACTIVEE`. Ne lève JAMAIS : un échec est journalisé et signalé (`tache: 'DEMO'`), la démo
 * existante reste servie et la nuit suivante réessaie.
 */
export async function executerEtapeDemo(deps: EtapeDemoDeps, regenerer: typeof regenererDemo = regenererDemo): Promise<void> {
  if (!deps.demoActivee) return
  try {
    const r = await regenerer(deps.prisma, deps.blob)
    deps.log.info({ statut: r.statut, demoId: r.demoId, supprimees: r.supprimees.length }, 'Espace de démonstration vérifié')
  } catch (err) {
    deps.log.error({ err }, 'Régénération de l’espace de démonstration échouée')
    deps.observabilite.signaler(err, { source: 'scheduler', tache: 'DEMO' })
  }
}
