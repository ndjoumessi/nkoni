-- Paiement en ligne réservé aux forfaits payants (spec 1.1 §1.3/§3.3) — mesure transitoire :
-- toute organisation ayant DÉJÀ une configuration de paiement (active ou non) la conserve.
ALTER TABLE "Organisation" ADD COLUMN "paiementEnLigneAcquis" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Organisation"
SET "paiementEnLigneAcquis" = true
WHERE "id" IN (SELECT "organisationId" FROM "ParametrePaiement");
