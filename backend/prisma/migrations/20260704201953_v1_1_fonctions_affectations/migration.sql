-- DropForeignKey
ALTER TABLE "AffectationFonction" DROP CONSTRAINT "AffectationFonction_fonctionId_fkey";

-- AlterTable
ALTER TABLE "AffectationFonction" ADD COLUMN     "dateDebut" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "dateFin" TIMESTAMP(3),
ADD COLUMN     "membreId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "FonctionFamiliale" ADD COLUMN     "description" TEXT,
ADD COLUMN     "nom" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "AffectationFonction_fonctionId_dateFin_idx" ON "AffectationFonction"("fonctionId", "dateFin");

-- CreateIndex
CREATE INDEX "AffectationFonction_membreId_idx" ON "AffectationFonction"("membreId");

-- CreateIndex
CREATE UNIQUE INDEX "FonctionFamiliale_nom_key" ON "FonctionFamiliale"("nom");

-- AddForeignKey
ALTER TABLE "AffectationFonction" ADD CONSTRAINT "AffectationFonction_fonctionId_fkey" FOREIGN KEY ("fonctionId") REFERENCES "FonctionFamiliale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationFonction" ADD CONSTRAINT "AffectationFonction_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
