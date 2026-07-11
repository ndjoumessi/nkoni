-- CreateEnum
CREATE TYPE "TypeCagnotte" AS ENUM ('DEUIL', 'MARIAGE', 'NAISSANCE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutCagnotte" AS ENUM ('OUVERTE', 'CLOTUREE');

-- CreateTable
CREATE TABLE "CagnotteEvenement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeCagnotte" NOT NULL DEFAULT 'AUTRE',
    "description" TEXT,
    "objectif" INTEGER,
    "dateEvenement" TIMESTAMP(3),
    "statut" "StatutCagnotte" NOT NULL DEFAULT 'OUVERTE',
    "beneficiaireMembreId" TEXT,
    "beneficiaireNom" TEXT,
    "montantReverse" INTEGER NOT NULL DEFAULT 0,
    "dateReversement" TIMESTAMP(3),
    "creeParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CagnotteEvenement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonCagnotte" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "cagnotteId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mode" "ModeVersement" NOT NULL DEFAULT 'ESPECES',
    "note" TEXT,
    "saisiParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonCagnotte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CagnotteEvenement_organisationId_statut_idx" ON "CagnotteEvenement"("organisationId", "statut");

-- CreateIndex
CREATE INDEX "CagnotteEvenement_organisationId_type_idx" ON "CagnotteEvenement"("organisationId", "type");

-- CreateIndex
CREATE INDEX "DonCagnotte_organisationId_cagnotteId_idx" ON "DonCagnotte"("organisationId", "cagnotteId");

-- AddForeignKey
ALTER TABLE "CagnotteEvenement" ADD CONSTRAINT "CagnotteEvenement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CagnotteEvenement" ADD CONSTRAINT "CagnotteEvenement_beneficiaireMembreId_fkey" FOREIGN KEY ("beneficiaireMembreId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonCagnotte" ADD CONSTRAINT "DonCagnotte_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonCagnotte" ADD CONSTRAINT "DonCagnotte_cagnotteId_fkey" FOREIGN KEY ("cagnotteId") REFERENCES "CagnotteEvenement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonCagnotte" ADD CONSTRAINT "DonCagnotte_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
