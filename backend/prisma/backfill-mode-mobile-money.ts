import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'

/**
 * BACKFILL (correction d'historique) — versements de PAIEMENT EN LIGNE encore en mode `AUTRE`.
 *
 * Avant l'ajout de la valeur d'enum `MOBILE_MONEY` (§ paiement), les versements créés à la
 * confirmation d'un paiement PSP (Mobile Money) étaient enregistrés en `AUTRE`. Ce script les
 * recatégorise en `MOBILE_MONEY`. La CIBLE est PRÉCISE et sûre : un `Versement` lié à un `Paiement`
 * (`Paiement.versementId`) est, par construction, le produit d'une collecte PSP réussie — donc du
 * Mobile Money. On ne touche QUE les versements liés à un paiement ET encore en `AUTRE`.
 *
 * ⚠️ Réécriture d'historique financier → **DRY-RUN PAR DÉFAUT** : sans `--apply`, le script LISTE
 * les lignes visées et n'écrit RIEN. Relire la sortie, valider le périmètre, PUIS relancer avec
 * `--apply`. Idempotent : le filtre `mode: 'AUTRE'` fait qu'une seconde exécution ne trouve plus rien.
 *
 *   Dry-run : npx tsx prisma/backfill-mode-mobile-money.ts
 *   Appliquer : npx tsx prisma/backfill-mode-mobile-money.ts --apply
 *
 * TRACE : un `updateMany` échappe à l'audit applicatif (`OPERATIONS_AUDITEES` ne couvre que les
 * create/update/delete UNITAIRES) — la sortie console est donc la seule trace. Sur un produit de
 * transparence financière, CAPTURER cette sortie, horodatée :
 *   DATABASE_URL="…" npm run backfill:mode-momo -- --apply 2>&1 | tee backfill-momo-$(date +%F).log
 *
 * NE PAS toucher `Recu.mode`. Le reçu porte un SNAPSHOT du mode, figé à la génération, et son PDF
 * est mis en cache sur Blob (il affiche déjà « Autre » chez les membres qui l'ont reçu). Réécrire
 * `Recu.mode` ferait diverger la base du document déjà remis. « Compléter » ce backfill en y ajoutant
 * `Recu` serait donc une RÉGRESSION, pas une amélioration — le mode du reçu doit rester ce qu'il
 * était à l'émission.
 *
 * Multi-tenant : maintenance globale sans requête HTTP → `runUnscoped` (aucun contexte d'org ; on
 * corrige toutes les organisations d'un coup, comme la purge). La cible reste bornée par la donnée
 * (lien Paiement→Versement + mode AUTRE), pas par un `organisationId`.
 */

const APPLIQUER = process.argv.includes('--apply') || process.env['APPLY'] === '1'

async function main(): Promise<void> {
  await orgContext.runUnscoped(async () => {
    // Paiements portant un versement (donc réussis) — `versementId` n'est renseigné qu'à REUSSI.
    const paiements = await prisma.paiement.findMany({
      where: { versementId: { not: null } },
      select: { versementId: true, referenceExterne: true, provider: true, organisationId: true },
    })
    const parVersement = new Map(paiements.map((p) => [p.versementId as string, p]))
    const versementIds = [...parVersement.keys()]

    if (versementIds.length === 0) {
      console.log('Aucun versement lié à un paiement. Rien à faire.')
      return
    }

    // Parmi eux, ceux ENCORE en `AUTRE` (les autres sont déjà corrects, ou d'un autre mode saisi).
    const cibles = await prisma.versement.findMany({
      where: { id: { in: versementIds }, mode: 'AUTRE' },
      select: { id: true, montant: true, dateVersement: true, organisationId: true },
      orderBy: { dateVersement: 'asc' },
    })

    console.log(`\n=== Backfill mode AUTRE → MOBILE_MONEY (versements de paiement en ligne) ===`)
    console.log(`Paiements avec versement : ${versementIds.length}`)
    console.log(`Versements CIBLÉS (liés à un paiement ET en mode AUTRE) : ${cibles.length}\n`)

    for (const v of cibles) {
      const p = parVersement.get(v.id)
      console.log(
        `  versement=${v.id}  org=${v.organisationId}  montant=${v.montant}  ` +
          `date=${v.dateVersement.toISOString().slice(0, 10)}  ` +
          `provider=${p?.provider ?? '?'}  ref=${p?.referenceExterne ?? '?'}`,
      )
    }

    if (cibles.length === 0) {
      console.log('\nRien à corriger (idempotent : déjà appliqué, ou aucun cas).')
      return
    }

    if (!APPLIQUER) {
      console.log(
        `\n[DRY-RUN] Aucune écriture. Relire ci-dessus, puis relancer avec --apply pour corriger.`,
      )
      return
    }

    // Garde `mode: 'AUTRE'` conservée dans le updateMany → idempotent et ne touche que la cible.
    const res = await prisma.versement.updateMany({
      where: { id: { in: cibles.map((v) => v.id) }, mode: 'AUTRE' },
      data: { mode: 'MOBILE_MONEY' },
    })
    console.log(`\n[APPLIQUÉ] ${res.count} versement(s) recatégorisé(s) AUTRE → MOBILE_MONEY.`)
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
