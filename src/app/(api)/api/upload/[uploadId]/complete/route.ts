import { rm } from "node:fs/promises";
import { auth } from "@lib/auth";
import { prisma } from "@prisma";
import ProbeVideo from "@api/upload/ProbeVideo";
import { enqueue } from "@api/upload/Jobs";
import { TranscodeStatus, VideoStatus } from "@/generated/prisma/enums";
import {
    deleteUploadSession,
    getUploadSession,
} from "@api/upload/_util/UploadSessions";

export async function POST(req: Request, { params }: { params: Promise<{ uploadId: string }> }) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { uploadId } = await params;
    const upload = getUploadSession(uploadId);

    if (!upload) return new Response("Not found", { status: 404 });
    if (upload.userId !== session.user.id) return new Response("Not found", { status: 404 });
    if (upload.completing) return new Response("Finalizing", { status: 409 });

    if (upload.received.size !== upload.totalChunks) {
        const missing: number[] = [];
        for (let i = 0; i < upload.totalChunks; i++) {
            if (!upload.received.has(i)) missing.push(i);
        }

        return Response.json(
            { error: "missing_chunks", missing },
            { status: 409 },
        );
    }

    // Guard against double-complete. Node is single-threaded so this flag flip is atomic against a concurrent call seeing an unlocked session.
    upload.completing = true;

    const { rawPath } = upload;
    const { title, description, range, selectedTracks, cuts } = upload.meta;
    const [start, end] = range;

    try {
        const { duration, trackNumbers } = await ProbeVideo(rawPath);

        if (end > duration + 0.05 ||
            !selectedTracks.every((number: number) => trackNumbers.includes(number))) {
            await rm(rawPath, { force: true }).catch(() => {});
            deleteUploadSession(uploadId);
            return new Response("Invalid range or tracks", { status: 400 });
        }
    } catch {
        await rm(rawPath, { force: true }).catch(() => {});
        deleteUploadSession(uploadId);
        return new Response("Could not read video", { status: 400 });
    }

    let video;
    try {
        video = await prisma.$transaction(async (tx) => {
            const created = await tx.video.create({
                data: {
                    title: title.trim(),
                    description: description,
                    fileUrl: `pending-${uploadId}.upload`,
                    status: VideoStatus.PROCESSING,
                    userId: session.user.id,
                },
            });
            const updated = await tx.video.update({
                where: { id: created.id },
                data: { fileUrl: `${created.id}.mp4` },
            });
            await tx.transcodeJob.create({
                data: {
                    videoId: created.id,
                    rawPath,
                    start,
                    end,
                    selectedTracks,
                    cuts,
                    status: TranscodeStatus.QUEUED,
                    progress: 0,
                },
            });
            return updated;
        });
    } catch (error) {
        console.error("Failed to enqueue transcode job:", error);
        await rm(rawPath, { force: true }).catch(() => {});
        deleteUploadSession(uploadId);
        return new Response("Could not queue encode", { status: 500 });
    }

    // Transcoder now owns rawPath via TranscodeJob.rawPath — drop the session.
    deleteUploadSession(uploadId);
    enqueue();

    return Response.json({ id: video.id });
}
