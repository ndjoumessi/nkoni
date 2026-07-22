-- CreateEnum
CREATE TYPE "ActionPlateforme" AS ENUM ('CHANGER_FORFAIT', 'SUSPENDRE', 'REACTIVER', 'PURGER', 'EXPORTER');

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "acteurId" TEXT NOT NULL,
    "acteurEmail" TEXT NOT NULL,
    "action" "ActionPlateforme" NOT NULL,
    "organisationCibleId" TEXT NOT NULL,
    "organisationNom" TEXT NOT NULL,
    "donneesAvant" JSONB,
    "donneesApres" JSONB,
    "dateAction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAuditLog_action_idx" ON "PlatformAuditLog"("action");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_organisationCibleId_idx" ON "PlatformAuditLog"("organisationCibleId");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_dateAction_idx" ON "PlatformAuditLog"("dateAction");
