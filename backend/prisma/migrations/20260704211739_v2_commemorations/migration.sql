-- CreateEnum
CREATE TYPE "TypeCommemoration" AS ENUM ('COMMEMORATION', 'CEREMONIE');

-- CreateEnum
CREATE TYPE "StatutCommemoration" AS ENUM ('PLANIFIEE', 'TENUE', 'ANNULEE');

-- AlterTable
ALTER TABLE "Commemoration" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "lieu" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "statut" "StatutCommemoration" NOT NULL DEFAULT 'PLANIFIEE',
ADD COLUMN     "titre" TEXT NOT NULL,
ADD COLUMN     "type" "TypeCommemoration" NOT NULL DEFAULT 'COMMEMORATION',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "_CommemorationMembresConcernes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CommemorationMembresConcernes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CommemorationMembresConcernes_B_index" ON "_CommemorationMembresConcernes"("B");

-- CreateIndex
CREATE INDEX "Commemoration_date_idx" ON "Commemoration"("date");

-- AddForeignKey
ALTER TABLE "_CommemorationMembresConcernes" ADD CONSTRAINT "_CommemorationMembresConcernes_A_fkey" FOREIGN KEY ("A") REFERENCES "Commemoration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommemorationMembresConcernes" ADD CONSTRAINT "_CommemorationMembresConcernes_B_fkey" FOREIGN KEY ("B") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
