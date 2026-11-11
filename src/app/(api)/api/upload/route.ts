import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { auth } from "@lib/auth";
import { prisma } from "@prisma";
import ProbeVideo from "@/app/(api)/api/upload/ProbeVideo";
import ConvertVideo from "@/app/(api)/api/upload/ConvertVideo";
import GenerateThumbnail from "@/app/(api)/api/upload/GenerateThumbnail";

const VIDEOS_DIR = path.resolve(process.cwd(), "videos");
const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails");
const STAGING_DIR = path.resolve(process.cwd(), "tmp"); // not under videos/
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

    await mkdir(STAGING_DIR, { recursive: true });
    await mkdir(VIDEOS_DIR, { recursive: true });
    await mkdir(THUMBNAILS_DIR, { recursive: true });
    const id = randomUUID();
    const rawPath = path.join(STAGING_DIR, `${id}.upload`);
    const outputPath = path.join(STAGING_DIR, `${id}.mp4`);
    const thumbPath = path.join(STAGING_DIR, `${id}.webp`);
    const finalPath = path.join(VIDEOS_DIR, `${id}.mp4`);

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

    const abort = new AbortController();
    const stopConversion = () => abort.abort();
    req.signal.addEventListener("abort", stopConversion, { once: true });

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const encoder = new TextEncoder();
            const send = (event: object) => {
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                } catch {}
            };

            let lastSent = 0;
            const onProgress = (value: number) => {
                const now = Date.now();
                if (value === 1 || now - lastSent >= 200) {
                    lastSent = now;
                    send({ type: "progress", value });
                }
            };

            let videoId: string | null = null;

            try {
                await ConvertVideo({
                    rawPath, outputPath, start, end,
                    tracks: selectedTracks,
                    signal: abort.signal,
                    onProgress,
                });

                if ((await stat(outputPath)).size === 0) throw new Error("Empty output");

                // Make the thumbnail before touching the DB, so a failure here leaves nothing behind
                await GenerateThumbnail({
                    videoPath: outputPath,
                    outputPath: thumbPath,
                    duration: end - start,
                    signal: abort.signal,
                });

                if (abort.signal.aborted) throw new Error("Upload canceled");

                await rename(outputPath, finalPath);
                const video = await prisma.video.create({
                    data: { title: title.trim(), description, fileUrl: `${id}.mp4`, userId: session.user.id },
                });
                videoId = video.id;

                await rename(thumbPath, path.join(THUMBNAILS_DIR, `${video.id}.webp`));

                send({ type: "done", id: video.id });
            } catch (error) {
                await rm(finalPath, { force: true }).catch(() => {});
                if (videoId) {
                    // Row was created but a later step failed: undo it
                    await prisma.video.delete({ where: { id: videoId } }).catch(() => {});
                    await rm(path.join(THUMBNAILS_DIR, `${videoId}.webp`), { force: true }).catch(() => {});
                }
                if (!abort.signal.aborted) {
                    console.error(error);
                    send({ type: "error", message: "Conversion failed" });
                }
            } finally {
                req.signal.removeEventListener("abort", stopConversion);
                await rm(rawPath, { force: true }).catch(() => {});
                await rm(outputPath, { force: true }).catch(() => {});
                await rm(thumbPath, { force: true }).catch(() => {});
                try {
                    controller.close();
                } catch {}
            }
        },
        cancel: stopConversion,
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    });
}
