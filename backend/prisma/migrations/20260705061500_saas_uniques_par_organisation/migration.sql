-- SaaS §2.2 — Uniques métier PAR ORGANISATION.
--
-- Remplace les uniques GLOBAUX (BaremeAnnuel.annee, Recu.numero, FonctionFamiliale.nom) par
-- des uniques COMPOSITES ([organisationId, champ]) : chaque organisation a son propre espace
-- de noms (même année de barème, même numéro de reçu, même nom de fonction dans deux orgs).
--
-- SÉCURITÉ DES DONNÉES : les valeurs existantes restent uniques par org (un unique global
-- implique l'unicité par (org, champ)), donc l'ajout des contraintes composites ne peut pas
-- échouer sur les données déjà en place. Les lectures par ces champs passent désormais par un
-- findFirst scopé (l'extension d'isolation injecte organisationId) — cf. contribution.service
-- (barème par année) et recu.service (dernier numéro). L'index composite (org, annee) de
-- BaremeAnnuel est retiré car le nouvel unique le couvre.

-- DropIndex
DROP INDEX "BaremeAnnuel_annee_key";

-- DropIndex
DROP INDEX "BaremeAnnuel_organisationId_annee_idx";

-- DropIndex
DROP INDEX "FonctionFamiliale_nom_key";

-- DropIndex
DROP INDEX "Recu_numero_key";

-- CreateIndex
CREATE UNIQUE INDEX "BaremeAnnuel_organisationId_annee_key" ON "BaremeAnnuel"("organisationId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "FonctionFamiliale_organisationId_nom_key" ON "FonctionFamiliale"("organisationId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "Recu_organisationId_numero_key" ON "Recu"("organisationId", "numero");
