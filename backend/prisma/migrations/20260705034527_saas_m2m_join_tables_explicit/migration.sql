-- SaaS §2.2 — Conversion des M2M IMPLICITES (Conflit↔Membre, Commémoration↔Membre) en
-- tables de jointure EXPLICITES porteuses d'`organisationId`, pour les faire entrer dans
-- le mécanisme d'isolation commun (extension Prisma scopée).
--
-- SANS PERTE : on crée d'abord les nouvelles tables, on RECOPIE les liens existants (en
-- dérivant `organisationId` de l'entité parente déjà backfillée en A2), PUIS on supprime
-- les anciennes tables implicites. Réversible côté données (les liens sont préservés).

-- CreateTable
CREATE TABLE "ConflitMembreConcerne" (
    "conflitId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "organisationId" TEXT,

    CONSTRAINT "ConflitMembreConcerne_pkey" PRIMARY KEY ("conflitId","membreId")
);

-- CreateTable
CREATE TABLE "CommemorationMembreConcerne" (
    "commemorationId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "organisationId" TEXT,

    CONSTRAINT "CommemorationMembreConcerne_pkey" PRIMARY KEY ("commemorationId","membreId")
);

-- CreateIndex
CREATE INDEX "ConflitMembreConcerne_membreId_idx" ON "ConflitMembreConcerne"("membreId");

-- CreateIndex
CREATE INDEX "ConflitMembreConcerne_organisationId_idx" ON "ConflitMembreConcerne"("organisationId");

-- CreateIndex
CREATE INDEX "CommemorationMembreConcerne_membreId_idx" ON "CommemorationMembreConcerne"("membreId");

-- CreateIndex
CREATE INDEX "CommemorationMembreConcerne_organisationId_idx" ON "CommemorationMembreConcerne"("organisationId");

-- AddForeignKey
ALTER TABLE "ConflitMembreConcerne" ADD CONSTRAINT "ConflitMembreConcerne_conflitId_fkey" FOREIGN KEY ("conflitId") REFERENCES "Conflit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflitMembreConcerne" ADD CONSTRAINT "ConflitMembreConcerne_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflitMembreConcerne" ADD CONSTRAINT "ConflitMembreConcerne_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommemorationMembreConcerne" ADD CONSTRAINT "CommemorationMembreConcerne_commemorationId_fkey" FOREIGN KEY ("commemorationId") REFERENCES "Commemoration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommemorationMembreConcerne" ADD CONSTRAINT "CommemorationMembreConcerne_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommemorationMembreConcerne" ADD CONSTRAINT "CommemorationMembreConcerne_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -------------------------------------------------------------------------
-- MIGRATION DE DONNÉES : recopie des liens implicites → tables explicites.
-- Dans une table de jointure implicite Prisma, les colonnes sont "A" et "B",
-- ordonnées par nom de modèle : Conflit < Membre → A=conflitId, B=membreId ;
-- Commemoration < Membre → A=commemorationId, B=membreId. `organisationId` est
-- dérivé du parent (Conflit / Commémoration), déjà peuplé par la migration A2.
-- -------------------------------------------------------------------------
INSERT INTO "ConflitMembreConcerne" ("conflitId", "membreId", "organisationId")
SELECT j."A", j."B", c."organisationId"
FROM "_ConflitMembresConcernes" j
JOIN "Conflit" c ON c."id" = j."A";

INSERT INTO "CommemorationMembreConcerne" ("commemorationId", "membreId", "organisationId")
SELECT j."A", j."B", cm."organisationId"
FROM "_CommemorationMembresConcernes" j
JOIN "Commemoration" cm ON cm."id" = j."A";

-- -------------------------------------------------------------------------
-- Suppression des anciennes tables implicites (après recopie).
-- -------------------------------------------------------------------------
-- DropForeignKey
ALTER TABLE "_CommemorationMembresConcernes" DROP CONSTRAINT "_CommemorationMembresConcernes_A_fkey";

-- DropForeignKey
ALTER TABLE "_CommemorationMembresConcernes" DROP CONSTRAINT "_CommemorationMembresConcernes_B_fkey";

-- DropForeignKey
ALTER TABLE "_ConflitMembresConcernes" DROP CONSTRAINT "_ConflitMembresConcernes_A_fkey";

-- DropForeignKey
ALTER TABLE "_ConflitMembresConcernes" DROP CONSTRAINT "_ConflitMembresConcernes_B_fkey";

-- DropTable
DROP TABLE "_CommemorationMembresConcernes";

-- DropTable
DROP TABLE "_ConflitMembresConcernes";
