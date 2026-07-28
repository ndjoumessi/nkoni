-- CreateEnum
CREATE TYPE "StatutPresence" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSE');

-- CreateTable
CREATE TABLE "PresenceReunion" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reunionId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "statut" "StatutPresence" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresenceReunion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PresenceReunion_organisationId_idx" ON "PresenceReunion"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "PresenceReunion_reunionId_membreId_key" ON "PresenceReunion"("reunionId", "membreId");

-- AddForeignKey
ALTER TABLE "PresenceReunion" ADD CONSTRAINT "PresenceReunion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceReunion" ADD CONSTRAINT "PresenceReunion_reunionId_fkey" FOREIGN KEY ("reunionId") REFERENCES "Reunion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresenceReunion" ADD CONSTRAINT "PresenceReunion_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
