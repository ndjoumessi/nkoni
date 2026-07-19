-- Annulation COMPTABLE d'un reçu (§4.6) : un reçu numéroté, potentiellement déjà remis au membre,
-- ne se supprime pas — il se marque annulé et garde son numéro. Sans cela, corriger une saisie
-- erronée était impossible : la suppression du versement est refusée tant qu'un reçu ACTIF existe
-- (FK `onDelete: Restrict` + garde applicative), et aucune route ne permettait d'annuler.
--
-- Additive et NULLABLE → aucun backfill : `annuleLe IS NULL` ⇒ reçu ACTIF, ce qui est exactement
-- l'état voulu pour tous les reçus déjà émis. Aucune reprise de données à prévoir en prod.
--
-- `annuleParId` reste une FK SCALAIRE sans contrainte, comme `genereParId` (même choix, même
-- raison : l'auteur est une trace d'audit, la suppression d'un compte ne doit pas bloquer la
-- lecture d'un reçu historique).
-- Pas d'index ajouté : les gardes cherchent « un reçu ACTIF de ce versement ? » et
-- `Recu_versementId_idx` (migration `recu_fk_index`) couvre déjà le `versementId` — le
-- `annuleLe IS NULL` ne filtre ensuite qu'une poignée de lignes. Un index PARTIEL serait par
-- ailleurs invisible de `schema.prisma` (Prisma ne sait pas exprimer un `WHERE`) : il serait
-- vu comme une dérive et supprimé au prochain `migrate dev`.
ALTER TABLE "Recu"
  ADD COLUMN "annuleLe" TIMESTAMP(3),
  ADD COLUMN "annuleParId" TEXT,
  ADD COLUMN "motifAnnulation" TEXT;
