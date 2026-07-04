-- CreateEnum
CREATE TYPE "EntiteDocument" AS ENUM ('MEMBRE', 'REUNION', 'CONFLIT', 'COMMEMORATION');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "dateTeleversement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "entiteId" TEXT NOT NULL,
ADD COLUMN     "entiteType" "EntiteDocument" NOT NULL,
ADD COLUMN     "nom" TEXT NOT NULL,
ADD COLUMN     "tailleOctets" INTEGER NOT NULL,
ADD COLUMN     "televerseParId" TEXT NOT NULL,
ADD COLUMN     "typeFichier" TEXT NOT NULL,
ADD COLUMN     "url" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Document_entiteType_entiteId_idx" ON "Document"("entiteType", "entiteId");

-- CreateIndex
CREATE INDEX "Document_televerseParId_idx" ON "Document"("televerseParId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_televerseParId_fkey" FOREIGN KEY ("televerseParId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
