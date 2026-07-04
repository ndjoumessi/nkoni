-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entiteType" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "action" "ActionAudit" NOT NULL,
    "acteurId" TEXT,
    "donneesAvant" JSONB,
    "donneesApres" JSONB,
    "dateAction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_entiteType_entiteId_idx" ON "AuditLog"("entiteType", "entiteId");

-- CreateIndex
CREATE INDEX "AuditLog_acteurId_idx" ON "AuditLog"("acteurId");

-- CreateIndex
CREATE INDEX "AuditLog_dateAction_idx" ON "AuditLog"("dateAction");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
