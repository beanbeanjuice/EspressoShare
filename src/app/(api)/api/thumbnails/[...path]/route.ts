import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails");

// Only "<id>.webp", letters/digits/_/- in the id. Nothing else can get through, including "../"
const FILE_PATTERN = /^[A-Za-z0-9_-]+\.webp$/;

export async function GET(req: Request, { params }: { params: Promise<{ path: string }> }) {
    const { path: parts } = await params;
    const file = parts.length === 1 ? parts[0] : "";
    if (!FILE_PATTERN.test(file)) return new Response("Not found", { status: 404 });

    const filePath = path.join(THUMBNAILS_DIR, file);

    let info;
    try {
        info = await stat(filePath);
    } catch {
        return new Response("Not found", { status: 404 });
    }

    // Cheap ETag from size + modified time, so browsers can revalidate without re-downloading
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
        "ETag": etag,
        "Last-Modified": info.mtime.toUTCString(),
    };

    if (req.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
    }

    const data = await readFile(filePath);
    return new Response(data, {
        headers: { ...headers, "Content-Length": String(data.length) },
    });
}
