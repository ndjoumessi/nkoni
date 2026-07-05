-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- DropForeignKey
ALTER TABLE "Utilisateur" DROP CONSTRAINT "Utilisateur_organisationId_fkey";

-- AlterTable
ALTER TABLE "Utilisateur" ALTER COLUMN "organisationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
