-- SaaS §2.3 — Invariant d'intégrité du rôle plateforme transverse.
--
-- Un SUPER_ADMIN n'appartient à AUCUNE organisation ; tout autre rôle en a TOUJOURS une.
-- Cette contrainte remplace, pour la seule table Utilisateur, la garantie NOT NULL levée
-- par la migration précédente : elle empêche à la fois un super-admin rattaché à une org
-- ET un utilisateur tenant orphelin (organisationId NULL).
--
-- NB : dans un fichier de migration SÉPARÉ de l'ADD VALUE 'SUPER_ADMIN' (migration
-- précédente), car PostgreSQL interdit d'utiliser une valeur d'enum nouvellement ajoutée
-- dans la même transaction que son ajout.
ALTER TABLE "Utilisateur"
  ADD CONSTRAINT "Utilisateur_superadmin_org_check"
  CHECK (("role" = 'SUPER_ADMIN') = ("organisationId" IS NULL));
