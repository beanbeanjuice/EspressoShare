import { auth } from "@lib/auth";
import { deleteFailedVideo } from "@api/upload/Jobs";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ videoId: string }> },
) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { videoId } = await params;

    try {
        await deleteFailedVideo(videoId, session.user.id);
        return new Response(null, { status: 204 });
    } catch (error) {
        const code = error instanceof Error ? error.message : "unknown";

        // code status hell
        const status =
            code === "not_found"  ? 404 :
                code === "forbidden"  ? 403 :
                    code === "not_failed" ? 409 :
                        500;
        if (status === 500) console.error("Delete failed video:", error);
        return new Response(code, { status });
    }
}
