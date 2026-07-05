import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { hashPassword } from '../src/services/auth.service'
import { orgContext } from '../src/lib/org-context'

/**
 * Amorçage d'un compte ADMIN de test (dev uniquement) pour valider /auth/login
 * de bout en bout tant que le CRUD Utilisateur n'existe pas.
 *
 * Lancer avec : npm run seed
 */

// Organisation d'amorçage (WAMBA TCHOUPA) — id FIXE, cf. migration A2 populate_organisation_wamba.
const ORG_SEED_ID = '11111111-1111-1111-1111-111111111111'

async function main() {
  const email = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@nkoni.local'
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'admin1234'

  const passwordHash = await hashPassword(password)

  // Écriture DANS le contexte de l'organisation d'amorçage : l'extension d'isolation stampe
  // `organisationId` (Utilisateur est un modèle scopé). `run` + await à l'intérieur pour que
  // le contexte ALS couvre l'exécution différée de la requête Prisma.
  const admin = await orgContext.run({ organisationId: ORG_SEED_ID }, async () =>
    prisma.utilisateur.upsert({
      where: { email },
      update: { passwordHash, role: 'ADMIN', actif: true },
      create: { email, passwordHash, role: 'ADMIN', actif: true },
    }),
  )

  console.log('✔ ADMIN seedé :')
  console.log('  email    :', admin.email)
  console.log('  password :', password, '(dev — à changer)')
  console.log('  role     :', admin.role)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Échec du seed :', err)
    await prisma.$disconnect()
    process.exit(1)
  })
