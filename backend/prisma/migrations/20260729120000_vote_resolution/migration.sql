-- CreateEnum
CREATE TYPE "SensVote" AS ENUM ('POUR', 'CONTRE', 'ABSTENTION');

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "sens" "SensVote" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_organisationId_idx" ON "Vote"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_resolutionId_membreId_key" ON "Vote"("resolutionId", "membreId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
