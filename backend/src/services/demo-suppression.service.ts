import { orgContext } from '../lib/org-context'
import {
  assemblerExportOrganisation,
  collecterUrlsBlobs,
  purgerBlobs,
  supprimerDonneesOrganisation,
  type BlobPurgeClient,
} from './organisation-purge.service'
import { journaliserActionPlateforme } from './platform-audit.service'

/**
 * Espace de démonstration (spec 2026-09-15 §3.2) — suppression d'une organisation de démo.
 *
 * Réutilise la purge de tenant (même ordre, même scoping des `deleteMany`, base d'abord puis blobs) SANS
 * sa précondition humaine (suspension + confirmation du nom), réservée à la console. En échange, la nature
 * de démo est RELUE dans la transaction par une écriture conditionnelle (`estDemo: true`) qui suspend
 * l'organisation — condition exigée par `supprimerDonneesOrganisation` : aucune organisation réelle ne
 * peut être effacée par ce chemin, même appelée avec un mauvais identifiant.
 *
 * Journal `SUPPRIMER_DEMO` BEST-EFFORT (contrairement à `PURGER`) : l'objet supprimé est fictif et
 * régénérable, bloquer la régénération sur un échec d'écriture du journal ferait vieillir la démo.
 */

export class OrganisationNonDemoError extends Error {
  constructor(readonly organisationId: string) {
    super(`L'organisation ${organisationId} n'est pas un espace de démonstration.`)
    this.name = 'OrganisationNonDemoError'
  }
}

/** Acteur du journal plateforme pour la régénération (aucun compte derrière). */
export const ACTEUR_SYSTEME_DEMO = { id: 'systeme', email: 'systeme@nkoni' } as const

export interface SuppressionDemo {
  supprimee: boolean
  compteurs: Record<string, number>
  blobs: { supprimes: number; echecs: string[] }
  journalise: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function supprimerOrganisationDemo(prisma: any, blob: BlobPurgeClient, organisationId: string): Promise<SuppressionDemo> {
  // Hors de tout tenant : l'export lit les modèles scopés de l'organisation visée, la transaction les efface.
  return orgContext.runUnscoped(async () => {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, nom: true, estDemo: true, createdAt: true },
    })
    if (!org) return { supprimee: false, compteurs: {}, blobs: { supprimes: 0, echecs: [] }, journalise: false }
    if (org.estDemo !== true) throw new OrganisationNonDemoError(organisationId)

    const exportComplet = await assemblerExportOrganisation(prisma, organisationId)
    const urls = collecterUrlsBlobs(exportComplet)
    const utilisateurIds = (exportComplet.donnees['Utilisateur'] ?? []).map((u) => (u as { id: string }).id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultat: Record<string, number> | null = await prisma.$transaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (tx: any) => {
        // Relit DANS la transaction — distingue « n'est pas une démo » (organisation réelle, à
        // refuser) de « supprimée entre-temps par une exécution concurrente » (course bénigne, à
        // ignorer). Un simple `count !== 1` après l'`updateMany` confondait les deux : la seconde
        // levait `OrganisationNonDemoError` jusqu'à `observabilite.signaler`, un incident Sentry
        // pour rien.
        const courant = await tx.organisation.findUnique({ where: { id: organisationId }, select: { id: true, estDemo: true } })
        if (!courant) return null
        if (courant.estDemo !== true) throw new OrganisationNonDemoError(organisationId)

        const { count } = await tx.organisation.updateMany({
          where: { id: organisationId, estDemo: true },
          data: { actif: false },
        })
        // Course encore plus étroite : supprimée entre la relecture ci-dessus et cet `updateMany`.
        // On sait déjà, par la relecture, qu'il s'agissait d'une démo — abandon gracieux, pas d'erreur.
        if (count !== 1) return null
        return supprimerDonneesOrganisation(tx, organisationId, utilisateurIds)
      },
      { timeout: 120_000, maxWait: 15_000 },
    )
    if (resultat === null) return { supprimee: false, compteurs: {}, blobs: { supprimes: 0, echecs: [] }, journalise: false }
    const compteurs = resultat
    const blobs = await purgerBlobs(blob, urls)

    let journalise = true
    try {
      await journaliserActionPlateforme(prisma, {
        acteurId: ACTEUR_SYSTEME_DEMO.id,
        acteurEmail: ACTEUR_SYSTEME_DEMO.email,
        action: 'SUPPRIMER_DEMO',
        organisationCibleId: organisationId,
        organisationNom: org.nom,
        donneesAvant: { creeeLe: org.createdAt.toISOString() },
        donneesApres: { compteurs, blobsEnEchec: blobs.echecs.length },
      })
    } catch {
      journalise = false
    }
    return { supprimee: true, compteurs, blobs, journalise }
  })
}
