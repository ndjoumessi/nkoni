-- Échéance du forfait (spec 1.1 §2.1) — fin de la période payée, en fin de journée Africa/Douala.
-- Additive et NULLABLE : aucune organisation existante ne reçoit d'échéance, donc aucune
-- rétrogradation au déploiement (les Pro historiques restent Pro, sans date, jusqu'à ce que
-- l'opérateur en pose une par la console). NULL = pas d'échéance ; GRATUIT n'en a jamais.
ALTER TABLE "Organisation" ADD COLUMN "forfaitExpireLe" TIMESTAMP(3);
