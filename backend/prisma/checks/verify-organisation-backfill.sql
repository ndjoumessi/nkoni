-- Contrôle d'intégrité du backfill organisationId (SaaS §9.3).
--
-- À exécuter APRÈS la migration de données A2 (populate_organisation_wamba), et
-- OBLIGATOIREMENT avant la Phase B (passage NOT NULL) — en local, en staging, et sur
-- la PROD au moment de la bascule (§9.6). Doit afficher « TOTAL orphelines : 0 ».
-- Si une seule ligne est orpheline, NE PAS passer organisationId en NOT NULL.
--
--   Usage : psql "<DATABASE_URL>" -f prisma/checks/verify-organisation-backfill.sql

DO $$
DECLARE
  r record;
  n bigint;
  tot bigint;
  orphelins bigint := 0;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'Utilisateur','BrancheFamiliale','Membre','BaremeAnnuel','Contribution','Versement',
    'EquilibrageContribution','EquilibrageDetail','Recu','Reunion','PointOrdreDuJour',
    'Resolution','FonctionFamiliale','AffectationFonction','EvenementFamilial','Conflit',
    'Commemoration','Document','AuditLog','Notification'
  ]) AS tbl
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE "organisationId" IS NULL) FROM %I', r.tbl
    ) INTO tot, n;
    RAISE NOTICE '% : % lignes, % orphelines', rpad(r.tbl, 26), tot, n;
    orphelins := orphelins + n;
  END LOOP;
  RAISE NOTICE '=== TOTAL orphelines (organisationId IS NULL) : % ===', orphelins;
  IF orphelins > 0 THEN
    RAISE EXCEPTION 'Backfill INCOMPLET : % ligne(s) orpheline(s) — NE PAS passer en NOT NULL', orphelins;
  END IF;
END $$;
