import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { auth } from "@lib/auth";
import {
    deleteUploadSession,
    getUploadSession,
} from "@api/upload/_util/UploadSessions";

export async function PUT(req: Request, { params }: { params: Promise<{ uploadId: string }> }) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { uploadId } = await params;
    const upload = getUploadSession(uploadId);

    // Treat "unknown session" and "not yours" as the same for security reasons.
    if (!upload) return new Response("Not found", { status: 404 });
    if (upload.userId !== session.user.id) return new Response("Not found", { status: 404 });
    if (upload.completing) return new Response("Finalizing", { status: 409 });

    const index = Number(new URL(req.url).searchParams.get("index"));
    if (!Number.isInteger(index) || index < 0 || index >= upload.totalChunks) {
        return new Response("Bad index", { status: 400 });
    }

    const offset = index * upload.chunkSize;
    const expected = Math.min(upload.chunkSize, upload.size - offset);

    if (!req.body) return new Response("Missing body", { status: 400 });

    let written = 0;
    let overflowed = false;
    const counter = new Transform({
        transform(chunk, _encoding, callback) {
            written += chunk.length;
            if (written > expected) {
                overflowed = true;
                callback(new Error("TOO_LARGE"));
                return;
            }
            callback(null, chunk);
        },
    });

    try {
        await pipeline(
            Readable.fromWeb(req.body as never),
            counter,
            createWriteStream(upload.rawPath, { flags: "r+", start: offset }),
        );
    } catch (error) {
        if (overflowed) return new Response("Chunk too large", { status: 413 });
        console.error("Chunk upload failed:", error);
        return new Response("Upload failed", { status: 500 });
    }

    if (written !== expected) {
        // Client dropped connection so we should retry
        return new Response("Incomplete chunk", { status: 400 });
    }

    upload.received.add(index);
    upload.lastActivity = Date.now();

    return new Response(null, { status: 204 });
}

// client cancelled for some reason
export async function DELETE(req: Request, { params }: { params: Promise<{ uploadId: string }> }) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { uploadId } = await params;
    const upload = getUploadSession(uploadId);

    if (!upload) return new Response(null, { status: 204 });
    if (upload.userId !== session.user.id) return new Response("Not found", { status: 404 });
    if (upload.completing) return new Response("Finalizing", { status: 409 });

    deleteUploadSession(uploadId);
    await rm(upload.rawPath, { force: true }).catch(() => {});
    return new Response(null, { status: 204 });
}
