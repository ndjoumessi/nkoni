-- Époque de session (sécurité, audit M5) : invalidation des refresh tokens au changement /
-- réinitialisation de mot de passe. Colonne NOT NULL DEFAULT 0 → backfill implicite (tous les
-- comptes existants démarrent à l'époque 0 ; leurs refresh en cours restent valides jusqu'au
-- prochain changement de mot de passe, ce qui est le comportement voulu).
ALTER TABLE "Utilisateur" ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 0;
