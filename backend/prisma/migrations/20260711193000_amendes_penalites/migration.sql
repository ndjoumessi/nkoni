-- CreateEnum
CREATE TYPE "TypeAmende" AS ENUM ('RETARD_COTISATION', 'ABSENCE_REUNION', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutAmende" AS ENUM ('IMPAYEE', 'PAYEE', 'ANNULEE');

-- CreateTable
CREATE TABLE "Amende" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "type" "TypeAmende" NOT NULL DEFAULT 'AUTRE',
    "motif" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "dateAmende" TIMESTAMP(3) NOT NULL,
    "statut" "StatutAmende" NOT NULL DEFAULT 'IMPAYEE',
    "datePaiement" TIMESTAMP(3),
    "modePaiement" "ModeVersement",
    "creeParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Amende_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Amende_organisationId_statut_idx" ON "Amende"("organisationId", "statut");

-- CreateIndex
CREATE INDEX "Amende_organisationId_membreId_idx" ON "Amende"("organisationId", "membreId");

-- AddForeignKey
ALTER TABLE "Amende" ADD CONSTRAINT "Amende_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amende" ADD CONSTRAINT "Amende_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
