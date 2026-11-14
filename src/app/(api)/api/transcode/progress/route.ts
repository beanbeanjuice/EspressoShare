import { auth } from "@lib/auth";
import { prisma } from "@prisma";
import {getLiveProgress} from "@api/upload/Jobs";
import {VideoStatus} from "@/generated/prisma/enums";

export async function GET(req: Request) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const rows = await prisma.video.findMany({
        where: {
            userId: session.user.id,
            status: { not: VideoStatus.READY },
        },
        select: {
            id: true,
            status: true,
            transcodeJob: { select: { progress: true, error: true } },
        },
    });

    const payload = rows.map((v) => ({
        videoId: v.id,
        status: v.status,
        progress: getLiveProgress(v.id) ?? v.transcodeJob?.progress ?? 0,
        error: v.transcodeJob?.error ?? null,
    }));

    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
