/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Notification` table. All the data in the column will be lost.
  - Added the required column `destinataireId` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `message` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `titre` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('VERSEMENT_RECU', 'COTISATION_RETARD');

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "createdAt",
ADD COLUMN     "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateLecture" TIMESTAMP(3),
ADD COLUMN     "destinataireId" TEXT NOT NULL,
ADD COLUMN     "entiteId" TEXT,
ADD COLUMN     "entiteType" TEXT,
ADD COLUMN     "lu" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "message" TEXT NOT NULL,
ADD COLUMN     "titre" TEXT NOT NULL,
ADD COLUMN     "type" "TypeNotification" NOT NULL;

-- CreateIndex
CREATE INDEX "Notification_destinataireId_lu_idx" ON "Notification"("destinataireId", "lu");

-- CreateIndex
CREATE INDEX "Notification_destinataireId_type_dateCreation_idx" ON "Notification"("destinataireId", "type", "dateCreation");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
