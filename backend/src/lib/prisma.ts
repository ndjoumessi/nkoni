import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { auditExtension } from './audit-middleware'
import { tenantExtension } from './tenant-extension'

/**
 * Instance PrismaClient partagée pour toute l'application.
 *
 * Prisma 7 (générateur `prisma-client`, sans moteur Rust embarqué) nécessite un
 * driver adapter. On utilise l'adapter Postgres (@prisma/adapter-pg) alimenté par
 * DATABASE_URL.
 *
 * Deux extensions sont chaînées sur `base` (client NON étendu, passé aux deux pour lire
 * l'état « avant » / vérifier l'appartenance SANS récursion) :
 *   1. AUDIT (V2 §5) — trace les écritures des 6 entités surveillées.
 *   2. ISOLATION multi-tenant (SaaS §2.2) — appliquée EN DERNIER donc OUTERMOST : elle
 *      scope (ou fail-close) chaque requête sur l'organisation courante AVANT que l'audit
 *      ne s'exécute. Les flux légitimes sans org (login/refresh/scheduler/seed) passent par
 *      `orgContext.runUnscoped` / un contexte d'org explicite.
 *
 * Le résultat est recasté en PrismaClient : on n'expose que les opérations standard, les
 * tests unitaires injectent des mocks (l'isolation réelle est prouvée par les tests
 * d'intégration contre une vraie base).
 */
const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })

const base = new PrismaClient({ adapter })

export const prisma = base
  .$extends(auditExtension(base))
  .$extends(tenantExtension(base)) as unknown as PrismaClient

export type { PrismaClient }
