/*
  Warnings:

  - You are about to drop the `EvenementFamilial` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EvenementFamilial" DROP CONSTRAINT "EvenementFamilial_organisationId_fkey";

-- DropTable
DROP TABLE "EvenementFamilial";
