-- Idempotence PWA hors-ligne : clé client (uuid) unique par organisation sur Versement et Membre.
-- Colonne NULLABLE neuve → aucun conflit d'unicité sur l'existant (NULLs multiples autorisés en PG).

-- AlterTable
ALTER TABLE "Membre" ADD COLUMN "idempotenceKey" TEXT;

-- AlterTable
ALTER TABLE "Versement" ADD COLUMN "idempotenceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Membre_organisationId_idempotenceKey_key" ON "Membre"("organisationId", "idempotenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Versement_organisationId_idempotenceKey_key" ON "Versement"("organisationId", "idempotenceKey");
