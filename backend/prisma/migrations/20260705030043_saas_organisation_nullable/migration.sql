-- CreateEnum
CREATE TYPE "Devise" AS ENUM ('FCFA', 'EUR', 'USD', 'CAD');

-- CreateEnum
CREATE TYPE "Langue" AS ENUM ('FR', 'EN');

-- AlterTable
ALTER TABLE "AffectationFonction" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "BaremeAnnuel" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "BrancheFamiliale" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Commemoration" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Conflit" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Contribution" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "EquilibrageContribution" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "EquilibrageDetail" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "EvenementFamilial" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "FonctionFamiliale" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Membre" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "PointOrdreDuJour" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Recu" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Resolution" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Reunion" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "organisationId" TEXT;

-- AlterTable
ALTER TABLE "Versement" ADD COLUMN     "organisationId" TEXT;

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "devise" "Devise" NOT NULL,
    "langueDefaut" "Langue" NOT NULL DEFAULT 'FR',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffectationFonction_organisationId_idx" ON "AffectationFonction"("organisationId");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_idx" ON "AuditLog"("organisationId");

-- CreateIndex
CREATE INDEX "BaremeAnnuel_organisationId_annee_idx" ON "BaremeAnnuel"("organisationId", "annee");

-- CreateIndex
CREATE INDEX "BrancheFamiliale_organisationId_idx" ON "BrancheFamiliale"("organisationId");

-- CreateIndex
CREATE INDEX "Commemoration_organisationId_idx" ON "Commemoration"("organisationId");

-- CreateIndex
CREATE INDEX "Conflit_organisationId_idx" ON "Conflit"("organisationId");

-- CreateIndex
CREATE INDEX "Contribution_organisationId_annee_idx" ON "Contribution"("organisationId", "annee");

-- CreateIndex
CREATE INDEX "Document_organisationId_idx" ON "Document"("organisationId");

-- CreateIndex
CREATE INDEX "EquilibrageContribution_organisationId_idx" ON "EquilibrageContribution"("organisationId");

-- CreateIndex
CREATE INDEX "EquilibrageDetail_organisationId_idx" ON "EquilibrageDetail"("organisationId");

-- CreateIndex
CREATE INDEX "EvenementFamilial_organisationId_idx" ON "EvenementFamilial"("organisationId");

-- CreateIndex
CREATE INDEX "FonctionFamiliale_organisationId_idx" ON "FonctionFamiliale"("organisationId");

-- CreateIndex
CREATE INDEX "Membre_organisationId_idx" ON "Membre"("organisationId");

-- CreateIndex
CREATE INDEX "Notification_organisationId_idx" ON "Notification"("organisationId");

-- CreateIndex
CREATE INDEX "PointOrdreDuJour_organisationId_idx" ON "PointOrdreDuJour"("organisationId");

-- CreateIndex
CREATE INDEX "Recu_organisationId_idx" ON "Recu"("organisationId");

-- CreateIndex
CREATE INDEX "Resolution_organisationId_idx" ON "Resolution"("organisationId");

-- CreateIndex
CREATE INDEX "Reunion_organisationId_idx" ON "Reunion"("organisationId");

-- CreateIndex
CREATE INDEX "Utilisateur_organisationId_idx" ON "Utilisateur"("organisationId");

-- CreateIndex
CREATE INDEX "Versement_organisationId_idx" ON "Versement"("organisationId");

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrancheFamiliale" ADD CONSTRAINT "BrancheFamiliale_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaremeAnnuel" ADD CONSTRAINT "BaremeAnnuel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Versement" ADD CONSTRAINT "Versement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquilibrageContribution" ADD CONSTRAINT "EquilibrageContribution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquilibrageDetail" ADD CONSTRAINT "EquilibrageDetail_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recu" ADD CONSTRAINT "Recu_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reunion" ADD CONSTRAINT "Reunion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOrdreDuJour" ADD CONSTRAINT "PointOrdreDuJour_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FonctionFamiliale" ADD CONSTRAINT "FonctionFamiliale_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationFonction" ADD CONSTRAINT "AffectationFonction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvenementFamilial" ADD CONSTRAINT "EvenementFamilial_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflit" ADD CONSTRAINT "Conflit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commemoration" ADD CONSTRAINT "Commemoration_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
