-- CreateEnum
CREATE TYPE "StatutConflit" AS ENUM ('OUVERT', 'EN_COURS', 'RESOLU', 'CLOS');

-- AlterTable
ALTER TABLE "Conflit" ADD COLUMN     "auteurId" TEXT NOT NULL,
ADD COLUMN     "dateOuverture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateResolution" TIMESTAMP(3),
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "responsableSuiviId" TEXT,
ADD COLUMN     "statut" "StatutConflit" NOT NULL DEFAULT 'OUVERT',
ADD COLUMN     "titre" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "_ConflitMembresConcernes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ConflitMembresConcernes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ConflitMembresConcernes_B_index" ON "_ConflitMembresConcernes"("B");

-- CreateIndex
CREATE INDEX "Conflit_niveauConfidentialite_idx" ON "Conflit"("niveauConfidentialite");

-- CreateIndex
CREATE INDEX "Conflit_auteurId_idx" ON "Conflit"("auteurId");

-- CreateIndex
CREATE INDEX "Conflit_responsableSuiviId_idx" ON "Conflit"("responsableSuiviId");

-- AddForeignKey
ALTER TABLE "Conflit" ADD CONSTRAINT "Conflit_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflit" ADD CONSTRAINT "Conflit_responsableSuiviId_fkey" FOREIGN KEY ("responsableSuiviId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConflitMembresConcernes" ADD CONSTRAINT "_ConflitMembresConcernes_A_fkey" FOREIGN KEY ("A") REFERENCES "Conflit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConflitMembresConcernes" ADD CONSTRAINT "_ConflitMembresConcernes_B_fkey" FOREIGN KEY ("B") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
