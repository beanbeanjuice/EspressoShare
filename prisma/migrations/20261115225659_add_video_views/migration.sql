-- CreateTable
CREATE TABLE "VideoView" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoView_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VideoView" ADD CONSTRAINT "VideoView_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
