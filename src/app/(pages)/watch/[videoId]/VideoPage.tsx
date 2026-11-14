'use client';

import styles from "./Video.module.scss";

import CustomVideoPlayer from "@components/VideoPlayer/VideoPlayer";
import {Typography} from "@mui/material";
import {Video} from "@/generated/prisma/browser";
import React, {useEffect} from "react";

type VideoPageProps = {
    video?: Video;
}

const VideoPage = (props: VideoPageProps) => {
    const ref = React.useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const v = ref.current;
        return () => v?.pause(); // runs when the page is hidden or unmounted
    }, []);

    return (
        <div className={styles.VideoPage}>
            <div className={styles.Left}>
                <CustomVideoPlayer ref={ref} src={`/api/videos/${props.video?.fileUrl}`} className={styles.Video} />
            </div>

            <div className={styles.Right}>
                <Typography variant="h5">{props.video?.title ?? "Loading title..."}</Typography>
                <Typography variant="h5">{props.video?.description ?? "Loading description..."}</Typography>
            </div>
        </div>
    );
}

export default VideoPage;
