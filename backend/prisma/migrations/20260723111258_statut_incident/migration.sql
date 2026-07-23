-- CreateEnum
CREATE TYPE "GraviteIncident" AS ENUM ('INFO', 'MAINTENANCE', 'INCIDENT');

-- CreateTable
CREATE TABLE "StatutIncident" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "gravite" "GraviteIncident" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutIncident_pkey" PRIMARY KEY ("id")
);
