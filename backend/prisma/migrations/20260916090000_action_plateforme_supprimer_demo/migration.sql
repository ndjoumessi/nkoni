-- Espace de démonstration (spec 2026-09-15 §3.2) : suppression d'une ancienne démo journalisée.
-- ADD VALUE SEUL dans sa migration : une valeur d'enum Postgres ne peut pas être utilisée dans la
-- transaction qui l'ajoute (CLAUDE.md, Conventions).
ALTER TYPE "ActionPlateforme" ADD VALUE 'SUPPRIMER_DEMO';
