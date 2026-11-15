import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { auth } from "@lib/auth";
import { UPLOADS_DIR } from "@api/upload/Jobs";
import { validateMeta } from "@api/upload/_util/UploadMeta";
import {
    CHUNK_SIZE,
    pruneStaleSessions,
    setUploadSession,
    sweepOrphanUploads,
} from "@api/upload/_util/UploadSessions";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 2 * 1024 ** 3);

export async function POST(req: Request) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return new Response("Bad metadata", { status: 400 });
    }

    const metaResult = validateMeta(body);
    if (!metaResult.ok) return new Response(metaResult.message, { status: metaResult.status });

    const bodyRecord = body as Record<string, unknown>;
    const size = bodyRecord.size;
    const fileName = bodyRecord.fileName;

    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
        return new Response("Bad size", { status: 400 });
    }

    if (size > MAX_BYTES) {
        return new Response("File too large", { status: 413 });
    }

    if (fileName !== undefined && typeof fileName !== "string") {
        return new Response("Bad fileName", { status: 400 });
    }

    await mkdir(UPLOADS_DIR, { recursive: true });

    // Fire and forget housekeeping
    // We don't want to delay the response
    void pruneStaleSessions();
    void sweepOrphanUploads();

    const uploadId = crypto.randomUUID();
    const rawPath = path.join(UPLOADS_DIR, `${uploadId}.upload`);

    // Pre-allocate the file so chunk writes can land at any offset via r+.
    try {
        const handle = await open(rawPath, "w");
        try {
            await handle.truncate(size);
        } finally {
            await handle.close();
        }
    } catch (error) {
        console.error("Failed to pre-allocate upload file:", error);
        return new Response("Could not create upload", { status: 500 });
    }

    const chunkSize = CHUNK_SIZE;
    const totalChunks = Math.ceil(size / chunkSize);
    const now = Date.now();

    setUploadSession({
        uploadId,
        userId: session.user.id,
        rawPath,
        size,
        chunkSize,
        totalChunks,
        received: new Set<number>(),
        meta: metaResult.meta,
        fileName: typeof fileName === "string" ? fileName : undefined,
        completing: false,
        createdAt: now,
        lastActivity: now,
    });

    return Response.json({ uploadId, chunkSize, totalChunks });
}
