-- Intégrité des reçus + index de FK (audit M3/m3).
--
-- ⚠️ PRÉ-CHECK OBLIGATOIRE AVANT `prisma migrate deploy` EN PROD : la contrainte FK échouera s'il
-- existe des reçus orphelins (versementId pointant sur un versement supprimé). Vérifier d'abord :
--   SELECT count(*) FROM "Recu" r LEFT JOIN "Versement" v ON r."versementId" = v.id WHERE v.id IS NULL;
-- Le résultat DOIT être 0. Sinon, corriger/purger les reçus orphelins avant d'appliquer.

-- Index sur les FK (Postgres n'indexe pas les FK automatiquement).
CREATE INDEX "Versement_contributionId_idx" ON "Versement"("contributionId");
CREATE INDEX "Recu_versementId_idx" ON "Recu"("versementId");

-- FK Recu → Versement, ON DELETE RESTRICT : impossible de supprimer un versement dont un reçu a
-- été émis (redondant avec la garde applicative, mais garantie au niveau base).
ALTER TABLE "Recu"
  ADD CONSTRAINT "Recu_versementId_fkey"
  FOREIGN KEY ("versementId") REFERENCES "Versement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
