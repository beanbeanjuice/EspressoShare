import { stat } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { prisma } from "@prisma";
import VideoPage from "./VideoPage";
import {Suspense} from "react";
import {io} from "next/cache";
import type {Metadata} from "next";
import {VideoStatus} from "@/generated/prisma/enums";
import ProbeVideo from "@/app/(api)/api/upload/ProbeVideo";
import {VIDEOS_DIR} from "@/app/(api)/api/upload/Jobs";

const Page = async ({ params }: { params: Promise<{ videoId: string}>}) => {
    return (
        <Suspense fallback={<p>Loading video...</p>}>
            <VideoResolver params={params} />
        </Suspense>
    );
}

const VideoResolver = async ({ params }: { params: Promise<{ videoId: string}>}) => {
    await io(); // Keeps the subtree out of the static shell

    const { videoId } = await params;

    const video = await prisma.video.findUnique({
        where: {
            id: videoId
        }
    });

    if (!video) notFound();
    if (video.status !== VideoStatus.READY) {
        return (
            <div style={{ padding: "2rem", textAlign: "center" }}>
                <p>
                    {video.status === VideoStatus.FAILED
                        ? "This video failed to process."
                        : "This video is still processing..."}
                </p>
            </div>
        );
    }

    return (
        <VideoPage video={video} />
    )
};

export const generateMetadata = async ({ params }: { params: Promise<{ videoId: string}>}): Promise<Metadata> => {
    const { videoId } = await params;

    const metadataBase = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");

    const fallback: Metadata = { title: "Espresso Share", metadataBase };

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.READY) return fallback;

    const fileName = video.fileUrl ?? `${video.id}.mp4`;
    const filePath = path.join(VIDEOS_DIR, fileName);

    let size: number | null = null;
    try {
        size = (await stat(filePath)).size;
    } catch {
        size = null;
    }

    // Probe older videos that don't have width/height saved yet.
    let width = video.width ?? null;
    let height = video.height ?? null;
    if ((width == null || height == null) && size != null) {
        try {
            const probed = await ProbeVideo(filePath);
            if (probed.width && probed.height) {
                width = probed.width;
                height = probed.height;
                await prisma.video
                    .update({ where: { id: video.id }, data: { width, height } })
                    .catch(() => {});
            }
        } catch { } // use defaults
    }

    const w = width ?? 1920;
    const h = height ?? 1080;

    const thumbnailUrl = `/api/thumbnails/${video.id}.webp`;
    const watchUrl = `/watch/${video.id}`;
    const videoUrl = `/api/videos/${fileName}`;
    const absoluteVideoUrl = new URL(videoUrl, metadataBase).toString();

    const description = video.description && video.description.length > 0 ? video.description : "Shared with Espresso Share";

    const maxMb = Number(process.env.EMBED_MAX_MB ?? 200);
    const maxBytes = (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : 200) * 1024 * 1024;
    const canEmbedVideo = size != null && size <= maxBytes;

    if (canEmbedVideo) {
        return {
            metadataBase: metadataBase,
            title: video.title,
            description: description,
            openGraph: {
                type: "video.other",
                url: watchUrl,
                title: video.title,
                description: description,
                images: [{ url: thumbnailUrl, width: w, height: h }],
                videos: [{
                    url: videoUrl,
                    secureUrl: absoluteVideoUrl,
                    type: "video/mp4",
                    width: w,
                    height: h,
                }],
            },
            twitter: {
                card: "player",
                title: video.title,
                description: description,
                players: [{
                    playerUrl: absoluteVideoUrl,
                    streamUrl: absoluteVideoUrl,
                    width: w,
                    height: h,
                }],
                images: [thumbnailUrl],
            },
        };
    }

    return {
        metadataBase: metadataBase,
        title: video.title,
        description: description,
        openGraph: {
            type: "website",
            url: watchUrl,
            title: video.title,
            description: description,
            images: [{ url: thumbnailUrl, width: w, height: h }],
        },
        twitter: {
            card: "summary_large_image",
            title: video.title,
            description: description,
            images: [thumbnailUrl],
        },
    };
};

export default Page;
