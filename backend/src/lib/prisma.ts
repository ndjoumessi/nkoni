import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

/**
 * Instance PrismaClient partagée pour toute l'application.
 *
 * Prisma 7 (générateur `prisma-client`, sans moteur Rust embarqué) nécessite un
 * driver adapter. On utilise l'adapter Postgres (@prisma/adapter-pg) alimenté par
 * DATABASE_URL.
 */
const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })

export const prisma = new PrismaClient({ adapter })

export type { PrismaClient }
