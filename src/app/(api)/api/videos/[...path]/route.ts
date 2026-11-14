import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const VIDEO_DIR = path.resolve(process.cwd(), "videos");

const MIME: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
    const { path: parts } = await params;
    const filePath = path.resolve(VIDEO_DIR, ...parts);

    // Block "../" tricks from escaping the videos folder
    if (!filePath.startsWith(VIDEO_DIR + path.sep)) return new Response("Not found", { status: 404 });

    let size: number;
    try {
        size = (await stat(filePath)).size;
    } catch {
        return new Response("Not found", { status: 404 });
    }

    const headers: Record<string, string> = {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "Accept-Ranges": "bytes",
    };

    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
        let start: number;
        let end: number;

        // thank god for stack overflow
        if (range[1]) {
            start = Number(range[1]);
            end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        } else {
            start = Math.max(size - Number(range[2]), 0); // "bytes=-500" = last 500 bytes
            end = size - 1;
        }

        if (start > end || start >= size) {
            return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
        }
        
        const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
        return new Response(stream, {
            status: 206,
            headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
        });
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
