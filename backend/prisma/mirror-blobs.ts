import 'dotenv/config'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { prisma } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { vercelBlobClient } from '../src/lib/blob'
import { construireCibles } from '../src/lib/blob-mirror'

/**
 * MIROIR HORS-SITE DES FICHIERS BLOB (dette GA D2). Télécharge les documents + photos référencés en
 * base vers un dossier local, que le workflow `.github/workflows/blob-mirror.yml` pousse ensuite vers
 * Cloudflare R2 (`aws s3 sync`, incrémental). Les reçus ne sont PAS concernés (ils se régénèrent).
 *
 * Multi-tenant : maintenance globale sans requête HTTP → `runUnscoped` (toutes organisations d'un
 * coup, comme la purge/backfill ; les modèles scopés `Document`/`Membre` sont lus sans filtre d'org).
 *
 * DRY-RUN PAR DÉFAUT : sans `--apply`, liste ce qui SERAIT copié et n'écrit rien. La sortie console
 * est la trace (comme le backfill).
 *
 * INCRÉMENTALITÉ — où elle vit VRAIMENT : le garde `existe(dest)` ci-dessous ne saute un fichier que
 * s'il est DÉJÀ sur le disque local ; il ne sert donc qu'à un re-run local, PAS en CI (le runner est
 * éphémère, `blob-mirror/` repart vide → tout est re-téléchargé). L'incrémental de TRANSFERT est
 * assuré par `aws s3 sync` (workflow) : seuls les objets absents de R2 sont poussés. À l'échelle
 * (milliers de photos), le download intégral depuis Blob à chaque run deviendra le coût à optimiser —
 * parade : lister R2 (`aws s3 ls`) et sauter le téléchargement des `cheminLocal` déjà présents.
 *
 *   Dry-run  : npx tsx prisma/mirror-blobs.ts
 *   Appliquer : DATABASE_URL="…" BLOB_READ_WRITE_TOKEN="…" npx tsx prisma/mirror-blobs.ts --apply
 */

const APPLIQUER = process.argv.includes('--apply') || process.env['APPLY'] === '1'
const DEST = process.env['BLOB_MIRROR_DIR'] ?? 'blob-mirror'

async function existe(chemin: string): Promise<boolean> {
  try {
    await stat(chemin)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const cibles = await orgContext.runUnscoped(async () => {
    const [documents, photosMembre, avatars] = await Promise.all([
      prisma.document.findMany({ select: { url: true } }),
      prisma.membre.findMany({ where: { photoBlobUrl: { not: null } }, select: { photoBlobUrl: true } }),
      prisma.utilisateur.findMany({ where: { photoBlobUrl: { not: null } }, select: { photoBlobUrl: true } }),
    ])
    return construireCibles({ documents, photosMembre, avatars })
  })

  console.log(`Miroir Blob — ${cibles.length} fichier(s) référencé(s) en base.`)

  if (!APPLIQUER) {
    for (const c of cibles) console.log(`  [dry-run] ${c.source.padEnd(18)} ${c.cheminLocal}`)
    console.log('\nDry-run : aucun fichier téléchargé. Relancer avec --apply.')
    return
  }

  let copies = 0
  let ignores = 0
  let manquants = 0
  for (const c of cibles) {
    const dest = join(DEST, c.cheminLocal)
    // Saute si DÉJÀ sur le disque local (blob immuable → même fichier). N'aide qu'en re-run local ;
    // en CI le runner est éphémère (cf. docstring), donc ce garde ne joue pas et le download est
    // intégral — l'incrémental de transfert est côté `aws s3 sync`.
    if (await existe(dest)) {
      ignores++
      continue
    }
    const buf = await vercelBlobClient.lireContenu(c.url)
    if (!buf) {
      // Blob illisible/absent : on le signale mais on ne fait pas échouer tout le miroir.
      manquants++
      console.warn(`  ILLISIBLE (Blob absent ?) : ${c.source} ${c.cheminLocal}`)
      continue
    }
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    copies++
  }
  console.log(`\nTerminé : ${copies} copié(s), ${ignores} déjà présent(s), ${manquants} illisible(s). → ${DEST}/`)
  if (manquants > 0) process.exitCode = 1 // signale au workflow qu'un blob référencé manquait.
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
