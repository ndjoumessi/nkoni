-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "chefMembreId" TEXT,
ADD COLUMN     "chefSurnom" TEXT;

-- AddForeignKey
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_chefMembreId_fkey" FOREIGN KEY ("chefMembreId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
