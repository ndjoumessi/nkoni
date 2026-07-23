-- CreateEnum
CREATE TYPE "PspProvider" AS ENUM ('FAPSHI', 'CAMPAY');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('EN_ATTENTE', 'REUSSI', 'ECHEC', 'EXPIRE');

-- CreateTable
CREATE TABLE "ParametrePaiement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "provider" "PspProvider" NOT NULL,
    "identifiantsChiffres" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametrePaiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "contributionId" TEXT,
    "montant" INTEGER NOT NULL,
    "telephone" TEXT NOT NULL,
    "provider" "PspProvider" NOT NULL,
    "referenceExterne" TEXT NOT NULL,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'EN_ATTENTE',
    "versementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParametrePaiement_organisationId_key" ON "ParametrePaiement"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_versementId_key" ON "Paiement"("versementId");

-- CreateIndex
CREATE INDEX "Paiement_organisationId_membreId_idx" ON "Paiement"("organisationId", "membreId");

-- CreateIndex
CREATE INDEX "Paiement_organisationId_statut_idx" ON "Paiement"("organisationId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "Paiement_organisationId_referenceExterne_key" ON "Paiement"("organisationId", "referenceExterne");

-- AddForeignKey
ALTER TABLE "ParametrePaiement" ADD CONSTRAINT "ParametrePaiement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_versementId_fkey" FOREIGN KEY ("versementId") REFERENCES "Versement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
