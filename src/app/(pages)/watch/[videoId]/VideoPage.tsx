'use client';

import styles from "./Video.module.scss";

import CustomVideoPlayer from "@components/VideoPlayer/VideoPlayer";
import {Card, Typography} from "@mui/material";
import {Video} from "@/generated/prisma/browser";
import React, {useEffect} from "react";
import LocalDate from "@components/LocalDate";
import VisibilityIcon from '@mui/icons-material/Visibility';

type VideoPageProps = {
    video: Video;
    sizeBytes: number | null;
    views: number;
}

const VideoPage = (props: VideoPageProps) => {
    const ref = React.useRef<HTMLVideoElement>(null);
    const counted = React.useRef(false);

    useEffect(() => {
        const v = ref.current;
        if (!v) return;

        const onPlay = () => {
            if (counted.current) return; // once per page load
            counted.current = true;
            navigator.sendBeacon(`/api/video/${props.video.id}/view`);
        };

        v.addEventListener("play", onPlay);

        return () => {
            v.removeEventListener("play", onPlay);
            v.pause();
        };
    }, [props.video.id]);

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
                    className={styles.Footer}
                >
                    <LocalDate date={props.video.createdAt} />
                    {props.sizeBytes != null && (
                        <>
                            <span>•</span>
                            <span>{(props.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                        </>
                    )}
                    <span>•</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}>
                        <VisibilityIcon fontSize="inherit" />
                        {props.views.toLocaleString()} {props.views === 1 ? "view" : "views"}
                    </span>
                </Typography>
            </Card>
        </div>
    );
}

export default VideoPage;
