-- CreateEnum
CREATE TYPE "TranscodeStatus" AS ENUM ('QUEUED', 'ENCODING', 'FAILED');

-- AlterTable
ALTER TABLE "Video" ALTER COLUMN "fileUrl" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TranscodeJob" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "rawPath" TEXT NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "selectedTracks" INTEGER[],
    "status" "TranscodeStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscodeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscodeJob_videoId_key" ON "TranscodeJob"("videoId");

-- AddForeignKey
ALTER TABLE "TranscodeJob" ADD CONSTRAINT "TranscodeJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
