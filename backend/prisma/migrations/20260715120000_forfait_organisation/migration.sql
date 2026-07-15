-- Forfait de l'organisation (SaaS §3.1) — palier commercial déterminant la limite de membres.
-- Un NOUVEAU type enum (CREATE TYPE) peut être créé ET utilisé dans la même migration ; seule
-- la forme « ALTER TYPE ... ADD VALUE » est interdite dans sa transaction d'ajout.
-- Rétro-compatible : la colonne a un DEFAULT 'GRATUIT' NOT NULL → toutes les organisations
-- existantes deviennent GRATUIT (aucun backfill séparé nécessaire).
CREATE TYPE "Forfait" AS ENUM ('GRATUIT', 'PRO', 'ENTREPRISE');

ALTER TABLE "Organisation"
  ADD COLUMN "forfait" "Forfait" NOT NULL DEFAULT 'GRATUIT';
