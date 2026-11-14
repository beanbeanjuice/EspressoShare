'use client';

import styles from "./Home.module.scss";
import {Video} from "@/generated/prisma/browser";
import {VideoStatus} from "@/generated/prisma/enums";
import VideoPart from "@components/VideoPart/VideoPart";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState} from "react";

type HomePageProps = {
    videos: Video[];
};

type ProgressRow = { videoId: string; status: string; progress: number; error: string | null };

const POLL_MS = 1500;

const HomePage = (props: HomePageProps) => {
    const router = useRouter();
    const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
    const refreshedFor = useRef(new Set<string>());

    const anyProcessing = props.videos.some((v) => v.status === VideoStatus.PROCESSING);

    useEffect(() => {
        if (!anyProcessing) return;
        let cancelled = false;

        const tick = async () => {
            try {
                const res = await fetch("/api/transcode/progress", { cache: "no-store" });
                if (!res.ok || cancelled) return;
                const rows: ProgressRow[] = await res.json();

                const map: Record<string, ProgressRow> = {};
                for (const row of rows) map[row.videoId] = row;
                setProgress(map);

                // We need this because if a card was processing but is now missing, it means
                // that is JUST became ready, so we need to refresh this.
                for (const v of props.videos) {
                    if (v.status !== VideoStatus.READY && !map[v.id] && !refreshedFor.current.has(v.id)) {
                        refreshedFor.current.add(v.id);
                        router.refresh();
                        break;
                    }
                }
            } catch {
                // ignored
            }
        };

        void tick();
        const handle = window.setInterval(tick, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(handle);
        };
    }, [anyProcessing, props.videos, router]);

    return (
        <div className={styles.Home}>
            <ul className={styles.VideoList}>
                {props.videos
                    .slice()
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .map((video) => {
                        const live = progress[video.id];
                        return (
                            <li key={video.id}>
                                <VideoPart
                                    video={video}
                                    liveStatus={live?.status}
                                    liveProgress={live?.progress}
                                    liveError={live?.error ?? null}
                                />
                            </li>
                        );
                    })}
            </ul>
        </div>
    );
};

export default HomePage;
