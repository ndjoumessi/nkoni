-- CreateEnum
CREATE TYPE "StatutDepense" AS ENUM ('BROUILLON', 'EN_ATTENTE', 'APPROUVEE', 'REJETEE', 'PAYEE');

-- CreateEnum
CREATE TYPE "CategorieDepense" AS ENUM ('AIDE_MEMBRE', 'FUNERAILLES', 'EVENEMENT', 'FONCTIONNEMENT', 'AUTRE');

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "categorie" "CategorieDepense" NOT NULL DEFAULT 'AUTRE',
    "statut" "StatutDepense" NOT NULL DEFAULT 'BROUILLON',
    "beneficiaireMembreId" TEXT,
    "saisiParId" TEXT NOT NULL,
    "approuveParId" TEXT,
    "motifRejet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Depense_organisationId_statut_idx" ON "Depense"("organisationId", "statut");

-- CreateIndex
CREATE INDEX "Depense_organisationId_date_idx" ON "Depense"("organisationId", "date");

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_beneficiaireMembreId_fkey" FOREIGN KEY ("beneficiaireMembreId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_approuveParId_fkey" FOREIGN KEY ("approuveParId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
