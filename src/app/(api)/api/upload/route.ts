import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { auth } from "@lib/auth";
import { prisma } from "@prisma";
import ProbeVideo from "@/app/(api)/api/upload/ProbeVideo";
import {enqueue, UPLOADS_DIR} from "@api/upload/Jobs";
import {TranscodeStatus, VideoStatus} from "@/generated/prisma/enums";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 2 * 1024 ** 3);

export async function POST(req: Request) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    let meta;
    try {
        meta = JSON.parse(decodeURIComponent(req.headers.get("x-upload-meta") ?? ""));
    } catch {
        return new Response("Bad metadata", { status: 400 });
    }

    const { title, description, range, selectedTracks } = meta;

    const [start, end] = Array.isArray(range) ? range : [];
    if (
        typeof title !== "string" || !title.trim() ||
        typeof description !== "string" ||
        !Number.isFinite(start) || !Number.isFinite(end) ||
        start < 0 || end <= start ||
        !Array.isArray(selectedTracks) ||
        !selectedTracks.every((number: unknown) => Number.isInteger(number))
    ) {
        return new Response("Bad metadata", { status: 400 });
    }

    if (Number(req.headers.get("content-length")) > MAX_BYTES) {
        return new Response("File too large", { status: 413 });
    }
    if (!req.body) return new Response("Missing file", { status: 400 });

    await mkdir(UPLOADS_DIR, { recursive: true });
    const rawName = `${crypto.randomUUID()}.upload`;
    const rawPath = path.join(UPLOADS_DIR, rawName);

    let bytes = 0;
    const sizeLimit = new Transform({
        transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            callback(bytes > MAX_BYTES ? new Error("TOO_LARGE") : null, chunk);
        },
    });

    try {
        await pipeline(Readable.fromWeb(req.body as never), sizeLimit, createWriteStream(rawPath));
    } catch (error) {
        await rm(rawPath, { force: true }).catch(() => {});
        const tooLarge = error instanceof Error && error.message === "TOO_LARGE";
        return new Response(tooLarge ? "File too large" : "Upload failed", {
            status: tooLarge ? 413 : 500,
        });
    }

    try {
        const { duration, trackNumbers } = await ProbeVideo(rawPath);
        if (end > duration + 0.05 ||
            !selectedTracks.every((number: number) => trackNumbers.includes(number))) {
            await rm(rawPath, { force: true }).catch(() => {});
            return new Response("Invalid range or tracks", { status: 400 });
        }
    } catch {
        await rm(rawPath, { force: true }).catch(() => {});
        return new Response("Could not read video", { status: 400 });
    }

    let video;
    try {
        video = await prisma.$transaction(async (tx) => {
            const created = await tx.video.create({
                data: {
                    title: title.trim(),
                    description,
                    fileUrl: `pending-${rawName}`,
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
                    status: TranscodeStatus.QUEUED,
                    progress: 0,
                },
            });
            return updated;
        });
    } catch (error) {
        console.error("Failed to enqueue transcode job:", error);
        await rm(rawPath, { force: true }).catch(() => {});
        return new Response("Could not queue encode", { status: 500 });
    }

    enqueue();

    return Response.json({ id: video.id });
}
