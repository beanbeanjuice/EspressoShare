/*
  Warnings:

  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRoles` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `username` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UserRoles" DROP CONSTRAINT "UserRoles_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserRoles" DROP CONSTRAINT "UserRoles_userId_fkey";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banExpires" TIMESTAMPTZ(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "username" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "description" TEXT NOT NULL;

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "UserRoles";

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
