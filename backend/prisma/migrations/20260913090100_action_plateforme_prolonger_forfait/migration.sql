-- Action plateforme « prolonger le forfait » (spec 1.1 §3.1), tracée dans PlatformAuditLog.
-- ADD VALUE SEUL dans sa migration : une valeur d'enum Postgres ne peut pas être utilisée dans la
-- transaction qui l'ajoute (CLAUDE.md, Conventions).
ALTER TYPE "ActionPlateforme" ADD VALUE 'PROLONGER_FORFAIT';
