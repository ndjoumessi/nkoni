import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { auditExtension } from './audit-middleware'

/**
 * Instance PrismaClient partagée pour toute l'application.
 *
 * Prisma 7 (générateur `prisma-client`, sans moteur Rust embarqué) nécessite un
 * driver adapter. On utilise l'adapter Postgres (@prisma/adapter-pg) alimenté par
 * DATABASE_URL.
 *
 * L'extension d'audit (V2 §5) est branchée ici : elle trace automatiquement les
 * écritures des 6 entités surveillées. `base` (client NON étendu) est passé à
 * l'extension pour lire l'état « avant » et écrire les entrées sans récursion.
 * Le résultat est recasté en PrismaClient : on n'expose que les opérations standard
 * (+ le modèle AuditLog, présent sur le client de base), les tests injectent des mocks.
 */
const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })

const base = new PrismaClient({ adapter })

export const prisma = base.$extends(auditExtension(base)) as unknown as PrismaClient

export type { PrismaClient }
