-- CreateEnum
CREATE TYPE "ModeRotation" AS ENUM ('ORDRE_FIXE', 'TIRAGE', 'ENCHERE');

-- CreateEnum
CREATE TYPE "StatutCycleTontine" AS ENUM ('EN_COURS', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutTourTontine" AS ENUM ('A_VENIR', 'REVERSE');

-- CreateTable
CREATE TABLE "Tontine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "montantBaseMise" INTEGER NOT NULL,
    "modeRotation" "ModeRotation" NOT NULL DEFAULT 'ORDRE_FIXE',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tontine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleTontine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "statut" "StatutCycleTontine" NOT NULL DEFAULT 'EN_COURS',
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleTontine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationTontine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "parts" INTEGER NOT NULL DEFAULT 1,
    "ordre" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationTontine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourTontine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "beneficiaireId" TEXT,
    "montantPot" INTEGER NOT NULL DEFAULT 0,
    "statut" "StatutTourTontine" NOT NULL DEFAULT 'A_VENIR',
    "dateReversement" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourTontine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiseTontine" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "dateMise" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiseTontine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tontine_organisationId_idx" ON "Tontine"("organisationId");
CREATE INDEX "CycleTontine_organisationId_idx" ON "CycleTontine"("organisationId");
CREATE UNIQUE INDEX "CycleTontine_tontineId_numero_key" ON "CycleTontine"("tontineId", "numero");
CREATE INDEX "ParticipationTontine_organisationId_idx" ON "ParticipationTontine"("organisationId");
CREATE UNIQUE INDEX "ParticipationTontine_cycleId_membreId_key" ON "ParticipationTontine"("cycleId", "membreId");
CREATE INDEX "TourTontine_organisationId_idx" ON "TourTontine"("organisationId");
CREATE UNIQUE INDEX "TourTontine_cycleId_numero_key" ON "TourTontine"("cycleId", "numero");
CREATE INDEX "MiseTontine_organisationId_idx" ON "MiseTontine"("organisationId");
CREATE UNIQUE INDEX "MiseTontine_tourId_membreId_key" ON "MiseTontine"("tourId", "membreId");

-- AddForeignKey
ALTER TABLE "Tontine" ADD CONSTRAINT "Tontine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CycleTontine" ADD CONSTRAINT "CycleTontine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CycleTontine" ADD CONSTRAINT "CycleTontine_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipationTontine" ADD CONSTRAINT "ParticipationTontine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipationTontine" ADD CONSTRAINT "ParticipationTontine_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CycleTontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipationTontine" ADD CONSTRAINT "ParticipationTontine_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TourTontine" ADD CONSTRAINT "TourTontine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TourTontine" ADD CONSTRAINT "TourTontine_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CycleTontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TourTontine" ADD CONSTRAINT "TourTontine_beneficiaireId_fkey" FOREIGN KEY ("beneficiaireId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MiseTontine" ADD CONSTRAINT "MiseTontine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MiseTontine" ADD CONSTRAINT "MiseTontine_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "TourTontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MiseTontine" ADD CONSTRAINT "MiseTontine_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
