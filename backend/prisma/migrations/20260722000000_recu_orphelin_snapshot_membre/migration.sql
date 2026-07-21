-- Reçu ORPHELIN (§4.6) — un versement dont le reçu est ANNULÉ redevient supprimable. Le reçu
-- survit, `versementId` passe à NULL (SetNull), et les champs FIGÉS ci-dessous le gardent
-- affichable dans l'historique du membre.
--
-- POURQUOI la ligne doit survivre : `genererNumeroSequentiel` (services/recu.service.ts) calcule
-- le prochain numéro par `max(numero)`. Supprimer le reçu au plus grand numéro ferait RÉUTILISER
-- ce numéro — deux reçus différents portant le même, dans le temps. Et `Recu` n'est pas dans
-- MODELES_AUDITES : sa suppression ne laisserait même pas de trace d'audit.
--
-- POURQUOI le snapshot : `Recu` n'avait AUCUN lien vers `Membre` (seul chemin : Recu → Versement
-- → Contribution → Membre) et les deux lectures filtrent par `versementId IN (...)`, qui ne
-- matche jamais NULL. Sans ces colonnes, un orphelin serait invisible partout — l'opération
-- détruirait la trace au lieu de la préserver. Historisation par COPIE, comme
-- `Contribution.montantAttendu` recopié du barème.
--
-- ⚠️ PRÉ-CHECK à passer AVANT `migrate deploy` en production (doit renvoyer 0) :
--     SELECT count(*) FROM "Recu" r
--     LEFT JOIN "Versement" v ON v.id = r."versementId" WHERE v.id IS NULL;
-- ⚠️ DUMP OBLIGATOIRE avant déploiement : irréversible en pratique — dès qu'un versement est
--    supprimé, aucun down-migration ne peut restaurer `versementId NOT NULL`.
--
-- Prisma exécute ce fichier dans UNE transaction : tout ou rien. NE PAS le scinder (voir §6).

-- 1) Colonnes NULLABLE, sans DEFAULT (aucune réécriture de table).
ALTER TABLE "Recu"
  ADD COLUMN "membreId"      TEXT,
  ADD COLUMN "montant"       INTEGER,
  ADD COLUMN "dateVersement" TIMESTAMP(3),
  ADD COLUMN "annee"         INTEGER,
  ADD COLUMN "mode"          "ModeVersement";

-- 2) Backfill par la jointure Recu → Versement → Contribution. Exhaustif par construction : la FK
--    actuelle est NOT NULL + Restrict, donc tout reçu existant A un versement.
UPDATE "Recu" r
SET "membreId"      = c."membreId",
    "montant"       = v."montant",
    "dateVersement" = v."dateVersement",
    "annee"         = c."annee",
    "mode"          = v."mode"
FROM "Versement" v
JOIN "Contribution" c ON c."id" = v."contributionId"
WHERE v."id" = r."versementId";

-- 3) Garde-fou EXPLICITE. Le SET NOT NULL échouerait aussi, mais avec un message qui ne dit ni
--    combien ni pourquoi. Ici le déploiement Railway s'arrête net (`migrate deploy && start`)
--    et l'ancienne image continue de servir.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "Recu" WHERE "membreId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Backfill Recu incomplet : % recu(s) sans membre resolu (versement pendant ?)', n;
  END IF;
END $$;

-- 4) Contract : NOT NULL.
ALTER TABLE "Recu"
  ALTER COLUMN "membreId"      SET NOT NULL,
  ALTER COLUMN "montant"       SET NOT NULL,
  ALTER COLUMN "dateVersement" SET NOT NULL,
  ALTER COLUMN "annee"         SET NOT NULL,
  ALTER COLUMN "mode"          SET NOT NULL;

-- 5) FK membre en RESTRICT — le SUJET du reçu, pas son auteur : un membre porteur de reçus ne se
--    supprime pas en silence. (La contrainte n'est pas nouvelle en pratique : `Contribution.membre`
--    est déjà Restrict implicite, un membre porteur de contributions est déjà indélétable.)
ALTER TABLE "Recu"
  ADD CONSTRAINT "Recu_membreId_fkey"
  FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Recu_organisationId_membreId_idx" ON "Recu"("organisationId", "membreId");

-- 6) versementId : DROP NOT NULL **D'ABORD**, puis Restrict → SetNull.
--
--    ⚠️ NE JAMAIS SCINDER ces trois instructions en deux migrations. Entre les deux, tout DELETE
--    de versement échouerait en « null value in column violates not-null constraint » — erreur
--    brute du driver, hors de tout mappage typé, donc 500 opaque (exactement le défaut vécu le
--    2026-07-21). Et un DROP CONSTRAINT sans son ADD laisserait des `versementId` PENDANTS (pas
--    NULL) que rien ne peut détecter : la trace serait perdue silencieusement.
ALTER TABLE "Recu" ALTER COLUMN "versementId" DROP NOT NULL;

ALTER TABLE "Recu" DROP CONSTRAINT "Recu_versementId_fkey";
ALTER TABLE "Recu"
  ADD CONSTRAINT "Recu_versementId_fkey"
  FOREIGN KEY ("versementId") REFERENCES "Versement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
