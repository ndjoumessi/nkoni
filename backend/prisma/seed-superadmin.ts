import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { hashPassword } from '../src/services/auth.service'
import { orgContext } from '../src/lib/org-context'

/**
 * Bootstrap du rôle plateforme SUPER_ADMIN (SaaS §2.3).
 *
 * Il n'existe AUCUN flux self-service pour créer un super-admin (contrairement à l'auto-
 * inscription des organisations). Ce script crée / met à jour le compte transverse à partir
 * de variables d'environnement, à lancer manuellement (ex. une fois sur Railway) :
 *
 *   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run seed:superadmin
 *
 * Propriétés :
 *   - Idempotent : relancer avec le même email met simplement à jour le mot de passe
 *     (utile pour une rotation) sans créer de doublon.
 *   - Sûr : REFUSE de transformer un utilisateur d'organisation existant en super-admin
 *     (l'invariant CHECK org NULL ⟺ SUPER_ADMIN l'interdirait de toute façon — on lève ici
 *     une erreur explicite plutôt qu'une erreur SQL brute).
 *   - Le super-admin est créé HORS organisation : `runUnscoped` (bypass de l'isolation) et
 *     organisationId laissé NULL. L'audit trail (par organisation) est volontairement ignoré
 *     pour cette écriture système.
 */

async function main(): Promise<void> {
  const email = process.env['SUPERADMIN_EMAIL']
  const password = process.env['SUPERADMIN_PASSWORD']

  if (!email || !password) {
    throw new Error(
      'SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD sont requis.\n' +
        '  Exemple : SUPERADMIN_EMAIL=admin@nkoni.io SUPERADMIN_PASSWORD=… npm run seed:superadmin',
    )
  }
  if (password.length < 8) {
    throw new Error('SUPERADMIN_PASSWORD doit contenir au moins 8 caractères.')
  }

  const passwordHash = await hashPassword(password)

  await orgContext.runUnscoped(async () => {
    const existant = await prisma.utilisateur.findUnique({
      where: { email },
      select: { id: true, role: true },
    })

    if (existant && existant.role !== 'SUPER_ADMIN') {
      throw new Error(
        `L'email « ${email} » appartient déjà à un utilisateur d'organisation (rôle ${existant.role}). ` +
          'Un super-admin est transverse : choisissez un email dédié.',
      )
    }

    if (existant) {
      await prisma.utilisateur.update({
        where: { email },
        data: { passwordHash, actif: true },
      })
      console.log(`✔ SUPER_ADMIN mis à jour (mot de passe rotationné) : ${email}`)
      return
    }

    // Création : organisationId volontairement ABSENT → NULL (invariant CHECK respecté).
    await prisma.utilisateur.create({
      data: { email, passwordHash, role: 'SUPER_ADMIN', actif: true },
    })
    console.log(`✔ SUPER_ADMIN créé : ${email}`)
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('✖ Échec du bootstrap super-admin :', err instanceof Error ? err.message : err)
    await prisma.$disconnect()
    process.exit(1)
  })
