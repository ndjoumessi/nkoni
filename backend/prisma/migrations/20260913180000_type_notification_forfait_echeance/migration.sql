-- Relances d'échéance du forfait (spec 1.1 §4.1) : notification FORFAIT_ECHEANCE.
-- ADD VALUE SEUL dans sa migration : une valeur d'enum Postgres ne peut pas être utilisée dans la
-- transaction qui l'ajoute (CLAUDE.md, Conventions).
ALTER TYPE "TypeNotification" ADD VALUE 'FORFAIT_ECHEANCE';
