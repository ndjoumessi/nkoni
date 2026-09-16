import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { vercelBlobClient } from '../src/lib/blob'
import { regenererDemo } from '../src/services/demo-regeneration.service'

/**
 * Génère l'espace de démonstration (spec 2026-09-15 §3.2) — première création en production, ou
 * régénération manuelle. Même chemin que l'étape nocturne, en mode FORCÉ : génère la nouvelle démo,
 * puis supprime les anciennes. Exécutée par le PO (cf. `docs/architecture-demo.md`, mise en service).
 *
 * Codes de sortie : 0 = démo prête ; 1 = échec (aucune démo partielle ne reste).
 * `backend/prisma/*.ts` n'est pas couvert par l'allowlist `runUnscoped` (scan de `src/` seulement) ;
 * ce script n'en contient aucun.
 */
async function main(): Promise<void> {
  if (process.env['DEMO_ACTIVEE'] !== 'true') {
    console.warn(
      "⚠️  DEMO_ACTIVEE n'est pas « true » dans cet environnement : la démo sera générée, mais POST /demo/session répondra 404 et la tâche de nuit ne la régénérera pas.",
    )
  }
  const debut = Date.now()
  const r = await regenererDemo(prisma, vercelBlobClient, { forcer: true })
  console.log(`✔ Démo ${r.statut === 'REGENEREE' ? 'générée' : 'déjà à jour'} : ${r.demoId}`)
  console.log(`  anciennes supprimées : ${r.supprimees.length}`)
  console.log(`  durée : ${Math.round((Date.now() - debut) / 1000)} s`)
}

main()
  .catch((err: unknown) => {
    console.error('✘ Échec de la génération de la démo :', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
