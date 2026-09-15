-- Espace de démonstration partagé (spec 2026-09-15 §1.1) : marqueur additif, aucune organisation
-- existante n'est une démo → défaut false, aucun backfill.
ALTER TABLE "Organisation" ADD COLUMN "estDemo" BOOLEAN NOT NULL DEFAULT false;
