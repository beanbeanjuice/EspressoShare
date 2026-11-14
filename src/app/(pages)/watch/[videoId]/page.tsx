import { notFound } from "next/navigation";
import { prisma } from "@prisma";
import VideoPage from "./VideoPage";
import {Suspense} from "react";
import {io} from "next/cache";
import {VideoStatus} from "@/generated/prisma/enums";

const Page = async ({ params }: { params: Promise<{ videoId: string}>}) => {
    return (
        <Suspense fallback={<p>Loading video...</p>}>
            <VideoResolver params={params} />
        </Suspense>
    );
}

const VideoResolver = async ({ params }: { params: Promise<{ videoId: string}>}) => {
    await io(); // Keeps the subtree otu of the static shell

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

export default Page;
