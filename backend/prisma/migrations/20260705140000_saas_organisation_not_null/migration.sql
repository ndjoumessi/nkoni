-- SaaS §9.2 (Phase B — contract) — `organisationId` NOT NULL sur les 22 tables métier.
--
-- Étape FINALE et IRRÉVERSIBLE de la migration multi-tenant. À n'appliquer qu'APRÈS
-- vérification 0 orphelin (prisma/checks/verify-organisation-backfill.sql) : un ALTER ...
-- SET NOT NULL échoue de lui-même s'il reste une seule ligne à organisationId NULL (garde-fou).
--
-- Les FK organisation étaient en ON DELETE SET NULL (relation optionnelle) ; comme la colonne
-- devient NOT NULL, Prisma les recrée en ON DELETE RESTRICT (une organisation référencée ne
-- peut plus être supprimée). Généré via `prisma migrate diff` (base live → schéma).


-- DropForeignKey
ALTER TABLE "AffectationFonction" DROP CONSTRAINT "AffectationFonction_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "BaremeAnnuel" DROP CONSTRAINT "BaremeAnnuel_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "BrancheFamiliale" DROP CONSTRAINT "BrancheFamiliale_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Commemoration" DROP CONSTRAINT "Commemoration_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "CommemorationMembreConcerne" DROP CONSTRAINT "CommemorationMembreConcerne_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Conflit" DROP CONSTRAINT "Conflit_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "ConflitMembreConcerne" DROP CONSTRAINT "ConflitMembreConcerne_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Contribution" DROP CONSTRAINT "Contribution_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "EquilibrageContribution" DROP CONSTRAINT "EquilibrageContribution_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "EquilibrageDetail" DROP CONSTRAINT "EquilibrageDetail_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "EvenementFamilial" DROP CONSTRAINT "EvenementFamilial_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "FonctionFamiliale" DROP CONSTRAINT "FonctionFamiliale_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Membre" DROP CONSTRAINT "Membre_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "PointOrdreDuJour" DROP CONSTRAINT "PointOrdreDuJour_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Recu" DROP CONSTRAINT "Recu_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Resolution" DROP CONSTRAINT "Resolution_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Reunion" DROP CONSTRAINT "Reunion_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Utilisateur" DROP CONSTRAINT "Utilisateur_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Versement" DROP CONSTRAINT "Versement_organisationId_fkey";

-- AlterTable
ALTER TABLE "AffectationFonction" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BaremeAnnuel" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BrancheFamiliale" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Commemoration" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CommemorationMembreConcerne" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Conflit" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ConflitMembreConcerne" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Contribution" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "EquilibrageContribution" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "EquilibrageDetail" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "EvenementFamilial" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "FonctionFamiliale" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Membre" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PointOrdreDuJour" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Recu" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Resolution" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Reunion" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Utilisateur" ALTER COLUMN "organisationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Versement" ALTER COLUMN "organisationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrancheFamiliale" ADD CONSTRAINT "BrancheFamiliale_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaremeAnnuel" ADD CONSTRAINT "BaremeAnnuel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Versement" ADD CONSTRAINT "Versement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquilibrageContribution" ADD CONSTRAINT "EquilibrageContribution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquilibrageDetail" ADD CONSTRAINT "EquilibrageDetail_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recu" ADD CONSTRAINT "Recu_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reunion" ADD CONSTRAINT "Reunion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOrdreDuJour" ADD CONSTRAINT "PointOrdreDuJour_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FonctionFamiliale" ADD CONSTRAINT "FonctionFamiliale_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationFonction" ADD CONSTRAINT "AffectationFonction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementFamilial" ADD CONSTRAINT "EvenementFamilial_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflit" ADD CONSTRAINT "Conflit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflitMembreConcerne" ADD CONSTRAINT "ConflitMembreConcerne_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commemoration" ADD CONSTRAINT "Commemoration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommemorationMembreConcerne" ADD CONSTRAINT "CommemorationMembreConcerne_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

