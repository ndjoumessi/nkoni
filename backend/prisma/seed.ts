import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { hashPassword } from '../src/services/auth.service'

/**
 * Amorçage d'un compte ADMIN de test (dev uniquement) pour valider /auth/login
 * de bout en bout tant que le CRUD Utilisateur n'existe pas.
 *
 * Lancer avec : npm run seed
 */
async function main() {
  const email = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@nkoni.local'
  const password = process.env['SEED_ADMIN_PASSWORD'] ?? 'admin1234'

  const passwordHash = await hashPassword(password)

  const admin = await prisma.utilisateur.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', actif: true },
    create: { email, passwordHash, role: 'ADMIN', actif: true },
  })

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
