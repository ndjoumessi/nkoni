/*
  Warnings:

  - Added the required column `ordre` to the `PointOrdreDuJour` table without a default value. This is not possible if the table is not empty.
  - Added the required column `titre` to the `PointOrdreDuJour` table without a default value. This is not possible if the table is not empty.
  - Added the required column `texte` to the `Resolution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Resolution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `Reunion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lieu` to the `Reunion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Reunion` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TypeReunion" AS ENUM ('ORDINAIRE', 'EXTRAORDINAIRE');

-- CreateEnum
CREATE TYPE "StatutReunion" AS ENUM ('PLANIFIEE', 'TENUE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutResolution" AS ENUM ('ADOPTEE', 'REJETEE', 'REPORTEE');

-- DropForeignKey
ALTER TABLE "PointOrdreDuJour" DROP CONSTRAINT "PointOrdreDuJour_reunionId_fkey";

-- DropForeignKey
ALTER TABLE "Resolution" DROP CONSTRAINT "Resolution_reunionId_fkey";

-- AlterTable
ALTER TABLE "PointOrdreDuJour" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "ordre" INTEGER NOT NULL,
ADD COLUMN     "titre" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Resolution" ADD COLUMN     "dateVote" TIMESTAMP(3),
ADD COLUMN     "pointOrdreDuJourId" TEXT,
ADD COLUMN     "statut" "StatutResolution" NOT NULL DEFAULT 'ADOPTEE',
ADD COLUMN     "texte" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Reunion" ADD COLUMN     "compteRenduTexte" TEXT,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "lieu" TEXT NOT NULL,
ADD COLUMN     "statut" "StatutReunion" NOT NULL DEFAULT 'PLANIFIEE',
ADD COLUMN     "type" "TypeReunion" NOT NULL DEFAULT 'ORDINAIRE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "PointOrdreDuJour_reunionId_ordre_idx" ON "PointOrdreDuJour"("reunionId", "ordre");

-- AddForeignKey
ALTER TABLE "PointOrdreDuJour" ADD CONSTRAINT "PointOrdreDuJour_reunionId_fkey" FOREIGN KEY ("reunionId") REFERENCES "Reunion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_reunionId_fkey" FOREIGN KEY ("reunionId") REFERENCES "Reunion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_pointOrdreDuJourId_fkey" FOREIGN KEY ("pointOrdreDuJourId") REFERENCES "PointOrdreDuJour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
