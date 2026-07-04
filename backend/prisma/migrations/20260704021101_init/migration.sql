-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRESIDENT', 'SECRETAIRE', 'TRESORIERE', 'COMMISSAIRE_COMPTES', 'GUIDE_RELIGIEUX', 'MEMBRE_SIMPLE');

-- CreateEnum
CREATE TYPE "StatutMembre" AS ENUM ('ACTIF', 'INACTIF', 'DECEDE');

-- CreateEnum
CREATE TYPE "ModeVersement" AS ENUM ('ESPECES', 'TIERS', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutContribution" AS ENUM ('A_JOUR', 'PARTIEL', 'NON_A_JOUR');

-- CreateEnum
CREATE TYPE "NiveauConfidentialite" AS ENUM ('PUBLIC', 'BUREAU', 'CONFIDENTIEL');

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrancheFamiliale" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrancheFamiliale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membre" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "sexe" TEXT,
    "dateNaissance" TIMESTAMP(3),
    "fonctionSociale" TEXT,
    "statut" "StatutMembre" NOT NULL DEFAULT 'ACTIF',
    "telephone" TEXT,
    "adresse" TEXT,
    "brancheId" TEXT,
    "chefSousFamilleId" TEXT,
    "anneeAdhesion" INTEGER NOT NULL,
    "anneeFinContribution" INTEGER,
    "dateDeces" TIMESTAMP(3),
    "compteUtilisateurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaremeAnnuel" (
    "id" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "montantAttendu" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaremeAnnuel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "montantAttendu" INTEGER NOT NULL,
    "montantVerse" INTEGER NOT NULL DEFAULT 0,
    "montantValorise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Versement" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "dateVersement" TIMESTAMP(3) NOT NULL,
    "mode" "ModeVersement" NOT NULL,
    "receptionnaireId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Versement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquilibrageContribution" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "anneeDebut" INTEGER NOT NULL,
    "anneeFin" INTEGER NOT NULL,
    "totalPeriode" INTEGER NOT NULL,
    "auteurId" TEXT NOT NULL,
    "dateApplication" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquilibrageContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquilibrageDetail" (
    "id" TEXT NOT NULL,
    "equilibrageId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "montantAvant" INTEGER NOT NULL,
    "montantApres" INTEGER NOT NULL,

    CONSTRAINT "EquilibrageDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recu" (
    "id" TEXT NOT NULL,
    "versementId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "genereParId" TEXT NOT NULL,
    "dateGeneration" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "urlPdf" TEXT,

    CONSTRAINT "Recu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reunion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reunion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointOrdreDuJour" (
    "id" TEXT NOT NULL,
    "reunionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointOrdreDuJour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolution" (
    "id" TEXT NOT NULL,
    "reunionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FonctionFamiliale" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FonctionFamiliale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffectationFonction" (
    "id" TEXT NOT NULL,
    "fonctionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffectationFonction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvenementFamilial" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenementFamilial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflit" (
    "id" TEXT NOT NULL,
    "niveauConfidentialite" "NiveauConfidentialite" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conflit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commemoration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commemoration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membre_compteUtilisateurId_key" ON "Membre"("compteUtilisateurId");

-- CreateIndex
CREATE UNIQUE INDEX "BaremeAnnuel_annee_key" ON "BaremeAnnuel"("annee");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_membreId_annee_key" ON "Contribution"("membreId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "Recu_numero_key" ON "Recu"("numero");

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_brancheId_fkey" FOREIGN KEY ("brancheId") REFERENCES "BrancheFamiliale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_chefSousFamilleId_fkey" FOREIGN KEY ("chefSousFamilleId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_compteUtilisateurId_fkey" FOREIGN KEY ("compteUtilisateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Versement" ADD CONSTRAINT "Versement_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquilibrageDetail" ADD CONSTRAINT "EquilibrageDetail_equilibrageId_fkey" FOREIGN KEY ("equilibrageId") REFERENCES "EquilibrageContribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOrdreDuJour" ADD CONSTRAINT "PointOrdreDuJour_reunionId_fkey" FOREIGN KEY ("reunionId") REFERENCES "Reunion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_reunionId_fkey" FOREIGN KEY ("reunionId") REFERENCES "Reunion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationFonction" ADD CONSTRAINT "AffectationFonction_fonctionId_fkey" FOREIGN KEY ("fonctionId") REFERENCES "FonctionFamiliale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
