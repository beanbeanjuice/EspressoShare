-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('READY', 'PROCESSING', 'FAILED');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'PROCESSING';
