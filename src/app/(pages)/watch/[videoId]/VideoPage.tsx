'use client';

import styles from "./Video.module.scss";

import CustomVideoPlayer from "@components/VideoPlayer/VideoPlayer";
import {Card, Typography} from "@mui/material";
import {Video} from "@/generated/prisma/browser";
import React, {useEffect} from "react";
import LocalDate from "@components/LocalDate";

type VideoPageProps = {
    video: Video;
    sizeBytes: number | null;
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
                <CustomVideoPlayer ref={ref} src={`/api/videos/${props.video.fileUrl}`} className={styles.Video} />
            </div>

            <Card className={styles.Right}>
                <Typography
                    component="h1"
                    variant="h3"
                    color="secondary"
                    align="center"
                >
                    {props.video.title}
                </Typography>

                <Typography
                    component="h2"
                    variant="h5"
                    align="center"
                    sx={{ fontStyle: "italic" }}
                >
                    {
                        props.video.description.trim().length > 0 ?
                            props.video.description
                            :
                            "No description provided... 🥺"
                    }
                </Typography>

                <Typography
                    variant="body1"
                    color="secondary"
                    align="center"
                >
                    <LocalDate date={props.video.createdAt} /> {props.sizeBytes != null ? ` - ${(props.sizeBytes / 1024 / 1024).toFixed(1)} MB` : null}
                </Typography>
            </Card>
        </div>
    );
}

export default VideoPage;
