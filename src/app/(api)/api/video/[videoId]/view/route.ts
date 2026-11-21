import { createHash } from "node:crypto";
import { prisma } from "@prisma";
import { VideoStatus } from "@/generated/prisma/enums";

const BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord/i;
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // same viewer + same video within 30 min = 1 view
const recent = new Map<string, number>(); // in memory only, never saved

function shouldCount(videoId: string, ip: string, ua: string): boolean {
    const now = Date.now();

    for (const [k, t] of recent) if (now - t > DEDUP_WINDOW_MS) recent.delete(k);

    const day = Math.floor(now / 86_400_000);
    const key = createHash("sha256").update(`${videoId}|${ip}|${ua}|${day}`).digest("hex");

    if (recent.has(key)) return false;
    recent.set(key, now);

    return true;
}

export async function POST(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
    const { videoId } = await params;

    // Best effort to not count bots as views
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || BOT_RE.test(ua)) return new Response(null, { status: 204 });

    // This really isn't necessary for a personal website, but it just prevents
    // like when you refresh a lot and that counting as one view.
    const ip =
        req.headers.get("x-real-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        "";
    if (!shouldCount(videoId, ip, ua)) return new Response(null, { status: 204 });

    // Only videos that are in the READY state can be "viewed"
    const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { status: true },
    });
    if (!video || video.status !== VideoStatus.READY) return new Response(null, { status: 204 });

    await prisma.videoView.create({ data: { videoId } });
    return new Response(null, { status: 204 });
}
