import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { rechiffrerSecret, validerClesPsp } from '../src/lib/crypto-secret'

/**
 * ROTATION de `PSP_ENCRYPTION_KEY` — réécrit les identifiants PSP de chaque organisation sous la clé
 * COURANTE (procédure complète : `docs/RUNBOOK_rotation_secrets.md` §3).
 *
 * Prérequis : `PSP_ENCRYPTION_KEY` = nouvelle clé, `PSP_ENCRYPTION_KEY_PRECEDENTE` = ancienne clé,
 * dans l'environnement où le script tourne (les mêmes valeurs que sur Railway).
 *
 * ⚠️ **DRY-RUN PAR DÉFAUT** : sans `--apply`, le script classe chaque configuration (à jour / à
 * rechiffrer / illisible) et n'écrit RIEN. Idempotent : une configuration déjà sous la clé courante est
 * laissée telle quelle.
 *
 *   Dry-run   : npm run rechiffrer:psp
 *   Appliquer : npm run rechiffrer:psp -- --apply
 *
 * Codes de sortie : 0 = terminé ; 1 = clés absentes/mal formées, configuration illisible ou erreur ;
 * 2 = au moins une configuration modifiée pendant l'application (relancer le dry-run).
 *
 * N'affiche JAMAIS de secret, ni chiffré ni en clair : seulement des identifiants d'organisation et des
 * comptes.
 *
 * Écriture CONDITIONNELLE (`updateMany` sur l'id ET l'ancien ciphertext) : si l'organisation a
 * reconfiguré son prestataire pendant le script, sa nouvelle configuration (déjà sous la clé courante)
 * n'est pas écrasée.
 *
 * Multi-tenant : maintenance globale hors requête HTTP → `runUnscoped`, bornée par la donnée (chaque
 * ligne réécrite par son `id`, jamais un `updateMany` sans filtre). Le script vit hors de `src/`, donc
 * hors de l'allowlist `runUnscoped` (même statut que `backfill-mode-mobile-money.ts`).
 */

// Écriture UNIQUEMENT sur l'argument explicite : aucune variable d'environnement ne bascule en écriture.
const APPLIQUER = process.argv.includes('--apply')

async function main(): Promise<void> {
  // Contrôle de forme AVANT toute lecture : une clé mal saisie classerait sinon toutes les
  // configurations « illisibles » et inviterait à faire ressaisir des identifiants qui sont intacts.
  const cles = validerClesPsp()
  if (cles.erreurCourante || cles.erreurPrecedente) {
    console.error(`Clés invalides : ${[cles.erreurCourante, cles.erreurPrecedente].filter(Boolean).join(' ')}`)
    process.exitCode = 1
    return
  }
  if (!cles.rotationEnCours) {
    // Le script ne sert que pendant une rotation : son absence signale un mauvais service ou une
    // variable oubliée, pas un succès.
    console.error('PSP_ENCRYPTION_KEY_PRECEDENTE absente : mauvais service Railway, ou variable non posée. Rien n’a été lu.')
    process.exitCode = 1
    return
  }
  await orgContext.runUnscoped(async () => {
    const configs = await prisma.parametrePaiement.findMany({
      select: { id: true, organisationId: true, identifiantsChiffres: true },
      orderBy: { createdAt: 'asc' },
    })
    let aJour = 0
    let rechiffrees = 0
    let modifieesEntreTemps = 0
    const illisibles: string[] = []

    console.log(`\n=== Rotation PSP_ENCRYPTION_KEY — ${APPLIQUER ? 'APPLICATION' : 'DRY-RUN'} ===`)
    console.log(`Configurations de paiement : ${configs.length}\n`)

    for (const c of configs) {
      let resultat
      try {
        resultat = rechiffrerSecret(c.identifiantsChiffres, c.organisationId)
      } catch {
        illisibles.push(c.organisationId)
        console.log(`  org=${c.organisationId}  ILLISIBLE avec les deux clés`)
        continue
      }
      if (resultat.statut === 'DEJA_A_JOUR') {
        aJour += 1
        continue
      }
      if (!APPLIQUER) {
        rechiffrees += 1
        console.log(`  org=${c.organisationId}  à rechiffrer`)
        continue
      }
      const { count } = await prisma.parametrePaiement.updateMany({
        where: { id: c.id, identifiantsChiffres: c.identifiantsChiffres },
        data: { identifiantsChiffres: resultat.chiffre },
      })
      if (count === 1) {
        rechiffrees += 1
        console.log(`  org=${c.organisationId}  rechiffrée`)
      } else {
        modifieesEntreTemps += 1
        console.log(`  org=${c.organisationId}  modifiée pendant le script : laissée telle quelle`)
      }
    }

    console.log(`\nDéjà sous la clé courante : ${aJour}`)
    console.log(`${APPLIQUER ? 'Rechiffrées' : 'À rechiffrer'} : ${rechiffrees}`)
    if (modifieesEntreTemps > 0) console.log(`Modifiées pendant le script : ${modifieesEntreTemps} (relancer pour vérifier)`)
    console.log(`Illisibles : ${illisibles.length}`)
    if (aJour === configs.length && configs.length > 0 && !APPLIQUER) {
      console.log(
        '\n⚠️  Toutes les configurations sont déjà sous la clé courante. Premier passage ? Vérifier que les deux ' +
          'variables n’ont pas été inversées (nouvelle clé = PSP_ENCRYPTION_KEY, ancienne = PSP_ENCRYPTION_KEY_PRECEDENTE).',
      )
    }
    if (illisibles.length > 0) {
      console.log(
        '\n⚠️  Ne PAS retirer PSP_ENCRYPTION_KEY_PRECEDENTE avant d’avoir traité les organisations illisibles ' +
          '(identifiants à ressaisir par leur bureau dans Paramètres).',
      )
      process.exitCode = 1
    } else if (modifieesEntreTemps > 0) {
      process.exitCode = 2
    } else if (APPLIQUER) {
      console.log('\nRelancer une fois en dry-run : « À rechiffrer : 0 » confirme que la clé précédente peut être retirée.')
    } else if (rechiffrees > 0) {
      console.log('\nDRY-RUN : rien n’a été écrit. Relancer avec --apply.')
    }
  })
}

main()
  .catch((err: unknown) => {
    // Nom et code seulement : un message d'erreur Prisma peut recopier les arguments de la requête.
    const code = (err as { code?: string }).code
    console.error('Rotation échouée :', err instanceof Error ? err.name : 'erreur', code ?? '')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
