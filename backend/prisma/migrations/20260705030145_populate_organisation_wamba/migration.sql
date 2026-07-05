-- Phase A2 (SaaS §2/§9.3) — migration de DONNÉES : rattache les données existantes
-- (mono-tenant) à une première Organisation « WAMBA TCHOUPA ».
--
-- Réversible : cette migration ne touche AUCUNE structure (colonnes déjà nullable en A1) ;
-- elle ne fait qu'INSERT l'organisation + peupler organisationId. Un rollback consisterait
-- à remettre organisationId à NULL et supprimer l'organisation.
--
-- Id FIXE (pas de gen_random_uuid) : la migration est ainsi REJOUABLE À L'IDENTIQUE sur la
-- prod lors de la bascule (§9.6), avec le même identifiant d'organisation partout.

INSERT INTO "Organisation" ("id", "nom", "devise", "langueDefaut", "actif", "createdAt")
VALUES ('11111111-1111-1111-1111-111111111111', 'WAMBA TCHOUPA', 'FCFA', 'FR', true, now());

-- Backfill de TOUTES les tables métier (idempotent : WHERE organisationId IS NULL).
UPDATE "Utilisateur"              SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "BrancheFamiliale"         SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Membre"                   SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "BaremeAnnuel"             SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Contribution"             SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Versement"                SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "EquilibrageContribution"  SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "EquilibrageDetail"        SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Recu"                     SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Reunion"                  SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "PointOrdreDuJour"         SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Resolution"               SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "FonctionFamiliale"        SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "AffectationFonction"      SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "EvenementFamilial"        SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Conflit"                  SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Commemoration"            SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Document"                 SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "AuditLog"                 SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
UPDATE "Notification"             SET "organisationId" = '11111111-1111-1111-1111-111111111111' WHERE "organisationId" IS NULL;
