-- AlterTable
ALTER TABLE "TranscodeJob" ADD COLUMN     "cuts" JSONB NOT NULL DEFAULT '[]';
