-- Refresh tokens stateful (sécurité M5) : rotation + détection de réutilisation (famille).
-- Table autonome (pas de FK vers Utilisateur pour rester simple et non scopée). Les tokens émis
-- AVANT cette migration n'ont pas de `jti` → traités comme « legacy » par la route (rétro-compat,
-- pas de rotation) jusqu'à leur prochaine émission.
CREATE TABLE "RefreshToken" (
  "id"            TEXT NOT NULL,
  "jti"           TEXT NOT NULL,
  "utilisateurId" TEXT NOT NULL,
  "familleId"     TEXT NOT NULL,
  "revoke"        BOOLEAN NOT NULL DEFAULT false,
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "RefreshToken"("jti");
CREATE INDEX "RefreshToken_utilisateurId_idx" ON "RefreshToken"("utilisateurId");
CREATE INDEX "RefreshToken_familleId_idx" ON "RefreshToken"("familleId");
