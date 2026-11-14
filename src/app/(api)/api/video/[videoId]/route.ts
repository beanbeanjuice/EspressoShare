import { rm } from "node:fs/promises";
import path from "node:path";
import { auth } from "@lib/auth";
import { prisma } from "@prisma";
import { THUMBNAILS_DIR, VIDEOS_DIR } from "@api/upload/Jobs";
import { TranscodeStatus, VideoStatus } from "@/generated/prisma/enums";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ videoId: string }> },
) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { videoId } = await params;

    const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { transcodeJob: true },
    });

    // 404 for both missing and not-owned so we don't leak existence.
    if (!video || video.userId !== session.user.id) {
        return new Response("Not found", { status: 404 });
    }

    const jobStatus = video.transcodeJob?.status;
    if (
        video.status === VideoStatus.PROCESSING ||
        jobStatus === TranscodeStatus.QUEUED ||
        jobStatus === TranscodeStatus.ENCODING
    ) {
        return new Response("Video is still processing", { status: 409 });
    }

    const rawPath = video.transcodeJob?.rawPath;
    const videoFileName = video.fileUrl ?? `${video.id}.mp4`;
    const videoFile = path.join(VIDEOS_DIR, videoFileName);
    const thumbFile = path.join(THUMBNAILS_DIR, `${video.id}.webp`);

    // Row delete cascades to TranscodeJob.
    await prisma.video.delete({ where: { id: videoId } });

    // Best effort cleanup but it may not work
    await Promise.all([
        rm(videoFile, { force: true }).catch(() => {}),
        rm(thumbFile, { force: true }).catch(() => {}),
        rawPath ? rm(rawPath, { force: true }).catch(() => {}) : Promise.resolve(),
    ]);

    return new Response(null, { status: 204 });
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ videoId: string }> },
) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { videoId } = await params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid JSON body", { status: 400 });
    }

    if (!body || typeof body !== "object") {
        return new Response("Invalid body", { status: 400 });
    }

    const { title, description } = body as { title?: unknown; description?: unknown };

    if (typeof title !== "string") {
        return new Response("Title is required", { status: 400 });
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
        return new Response("Title is required", { status: 400 });
    }
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
        return new Response(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`, { status: 400 });
    }

    if (typeof description !== "string") {
        return new Response("Description must be a string", { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        return new Response(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`, { status: 400 });
    }

    const existing = await prisma.video.findUnique({
        where: { id: videoId },
        select: { userId: true },
    });

    if (!existing || existing.userId !== session.user.id) {
        return new Response("Not found", { status: 404 });
    }

    const updated = await prisma.video.update({
        where: { id: videoId },
        data: { title: trimmedTitle, description },
        select: { id: true, title: true, description: true },
    });

    return Response.json(updated);
}
