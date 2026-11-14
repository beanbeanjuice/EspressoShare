import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@prisma";
import ConvertVideo from "@/app/(api)/api/upload/ConvertVideo";
import GenerateThumbnail from "@/app/(api)/api/upload/GenerateThumbnail";
import {TranscodeStatus, VideoStatus} from "@/generated/prisma/enums";

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const VIDEOS_DIR = path.resolve(process.cwd(), "videos");
export const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails");

const MAX_CONCURRENT = 2; // TODO: Possibly make this customizable in the future.

// rename() can't cross filesystems (e.g. separate Docker volumes) → fall back to copy + delete.
const moveFile = async (from: string, to: string) => {
    try {
        await rename(from, to);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await copyFile(from, to);
        await rm(from, { force: true });
    }
};

type JobRow = {
    id: string;
    videoId: string;
    rawPath: string;
    start: number;
    end: number;
    selectedTracks: number[];
};

//////////////////
// GLOBAL STATE //
//////////////////

// We only want one of these running at once.

const g = globalThis as unknown as {
    __transcodeState?: {
        running: Set<string>;
        progress: Map<string, number>;
        booted: boolean;
    };
};

const state = g.__transcodeState ?? {
    running: new Set<string>(),
    progress: new Map<string, number>(),
    booted: false,
};
g.__transcodeState = state;

//////////////////////
// END GLOBAL STATE //
//////////////////////

export const getLiveProgress = (videoId: string) => state.progress.get(videoId);

export const pump = async () => {
    while (state.running.size < MAX_CONCURRENT) {
        const next = await prisma.$transaction(async (tx) => {
            const candidate = await tx.transcodeJob.findFirst({
                where: { status: TranscodeStatus.QUEUED },
                orderBy: { createdAt: "asc" },
            });

            if (!candidate) return null;

            const claimed = await tx.transcodeJob.updateMany({
                where: { id: candidate.id, status: TranscodeStatus.QUEUED },
                data: { status: TranscodeStatus.ENCODING, progress: 0 },
            });

            return claimed.count === 1 ? candidate : null;
        });

        if (!next) return;

        state.running.add(next.id);

        void runJob({
            id: next.id,
            videoId: next.videoId,
            rawPath: next.rawPath,
            start: next.start,
            end: next.end,
            selectedTracks: next.selectedTracks,
        });
    }
};

export const enqueue = () => {
    void pump();
};

const runJob = async (job: JobRow) => {
    const stagingOutput = path.join(UPLOADS_DIR, `${job.videoId}.out.mp4`);
    const stagingThumb = path.join(UPLOADS_DIR, `${job.videoId}.webp`);
    const finalVideo = path.join(VIDEOS_DIR, `${job.videoId}.mp4`);
    const finalThumb = path.join(THUMBNAILS_DIR, `${job.videoId}.webp`);

    const abort = new AbortController(); // TODO: Implement this later at some point to cancel an in-progress encode.
    try {
        await mkdir(VIDEOS_DIR, { recursive: true });
        await mkdir(THUMBNAILS_DIR, { recursive: true });
        await mkdir(UPLOADS_DIR, { recursive: true });

        let lastWriteTs = 0;
        let lastWritePct = 0;
        const onProgress = async (value: number) => {
            state.progress.set(job.videoId, value);
            const now = Date.now();
            if (value === 1 || now - lastWriteTs >= 500 || value - lastWritePct >= 0.05) {
                lastWriteTs = now;
                lastWritePct = value;

                await prisma.transcodeJob
                    .update({ where: { id: job.id }, data: { progress: value } })
                    .catch(() => {});
            }
        };

        // We always want to...
        // 1 - convert the video first
        // 2 - use the thumbnail from that converted video

        await ConvertVideo({
            rawPath: job.rawPath,
            outputPath: stagingOutput,
            start: job.start,
            end: job.end,
            tracks: job.selectedTracks,
            signal: abort.signal,
            onProgress,
        });

        if ((await stat(stagingOutput)).size === 0) throw new Error("Empty output");

        await GenerateThumbnail({
            videoPath: stagingOutput,
            outputPath: stagingThumb,
            duration: job.end - job.start,
            signal: abort.signal,
        });

        await moveFile(stagingOutput, finalVideo);
        await moveFile(stagingThumb, finalThumb);

        await prisma.$transaction([
            prisma.video.update({
                where: { id: job.videoId },
                data: { status: VideoStatus.READY },
            }),
            prisma.transcodeJob.delete({ where: { id: job.id } }),
        ]);

        await rm(job.rawPath, { force: true }).catch(() => {});
    } catch (error) {
        console.error(`Transcode failed for video ${job.videoId}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        await prisma.video
            .update({ where: { id: job.videoId }, data: { status: VideoStatus.FAILED } })
            .catch(() => {});
        await prisma.transcodeJob
            .update({
                where: { id: job.id },
                data: { status: TranscodeStatus.FAILED, error: message.slice(0, 4000) },
            })
            .catch(() => {});
        await rm(stagingOutput, { force: true }).catch(() => {});
        await rm(stagingThumb, { force: true }).catch(() => {});
        await rm(job.rawPath, { force: true }).catch(() => {});
    } finally {
        state.progress.delete(job.videoId);
        state.running.delete(job.id);
        void pump();
    }
};

// Fix anything that wasn't encoded during a restart.
export const bootRecovery = async () => {
    if (state.booted) return; // weird bug with async tasks
    state.booted = true;

    try {
        await mkdir(UPLOADS_DIR, { recursive: true });
        await prisma.transcodeJob.updateMany({
            where: { status: TranscodeStatus.ENCODING },
            data: { status: TranscodeStatus.QUEUED, progress: 0 },
        });
    } catch (error) {
        console.error("Transcode boot recovery failed:", error);
    }

    await pump();
};

export const deleteFailedVideo = async (videoId: string, userId: string) => {
    const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { transcodeJob: true },
    });

    if (!video) throw new Error("not_found");
    if (video.userId !== userId) throw new Error("forbidden");
    if (video.status !== VideoStatus.FAILED) throw new Error("not_failed");

    await prisma.video.delete({ where: { id: videoId } });

    // Some stuff might get left behind... need to test?
    const rawPath = video.transcodeJob?.rawPath;
    const stagingOutput = path.join(UPLOADS_DIR, `${videoId}.out.mp4`);
    const stagingThumb = path.join(UPLOADS_DIR, `${videoId}.webp`);
    const finalVideo = path.join(VIDEOS_DIR, `${videoId}.mp4`);
    const finalThumb = path.join(THUMBNAILS_DIR, `${videoId}.webp`);

    await Promise.all([
        rawPath ? rm(rawPath, { force: true }).catch(() => {}) : Promise.resolve(),
        rm(stagingOutput, { force: true }).catch(() => {}),
        rm(stagingThumb, { force: true }).catch(() => {}),
        rm(finalVideo, { force: true }).catch(() => {}),
        rm(finalThumb, { force: true }).catch(() => {}),
    ]);
};
