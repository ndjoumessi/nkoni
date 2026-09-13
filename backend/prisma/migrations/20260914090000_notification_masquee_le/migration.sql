-- Suppression LOGIQUE des notifications (F1, spec 1.1 §4.1) : le dédoublonnage des relances
-- de forfait (`forfait-relances.service.ts`) et des rappels de réunion (`notification-scheduler.ts`)
-- repose sur l'EXISTENCE de la ligne `Notification`. Or `supprimerNotification` la SUPPRIMAIT
-- (`deleteMany`) : un ADMIN qui écartait une relance de forfait la voyait revenir chaque nuit.
--
-- Additive et NULLABLE → aucun backfill : `masqueeLe IS NULL` ⇒ visible, ce qui est exactement
-- l'état voulu pour toutes les notifications déjà en base.
ALTER TABLE "Notification" ADD COLUMN "masqueeLe" TIMESTAMP(3);
