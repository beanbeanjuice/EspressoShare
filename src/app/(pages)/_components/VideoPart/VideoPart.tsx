'use client';

import styles from "./VideoPart.module.scss";
import {Typography} from "@mui/material";
import {Video} from "@/generated/prisma/client";
import React from "react";
import Link from "next/link";

type VideoPartProps = {
    video: Video;
}

const HOVER_DELAY_MS = 250; // don't load videos when the mouse just sweeps across the grid

const VideoPart = (props: VideoPartProps) => {
    const [active, setActive] = React.useState(false);   // video element mounted
    const [playing, setPlaying] = React.useState(false); // first frame is actually showing
    const timer = React.useRef<number | undefined>(undefined);

    const start = () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setActive(true), HOVER_DELAY_MS);
    };

    const stop = () => {
        window.clearTimeout(timer.current);
        setActive(false);
        setPlaying(false);
    };

    React.useEffect(() => () => window.clearTimeout(timer.current), []);

    return (
        <Link className={styles.Part} href={`/watch/${props.video.id}`} onPointerEnter={start} onPointerLeave={stop}>
            <div className={styles.Media}>
                <img
                    className={styles.Thumbnail}
                    src={`/api/thumbnails/${props.video.id}.webp`}
                    alt={`Thumbnail for ${props.video.title}`}
                    loading="lazy"
                />
                {active && (
                    <HoverPreview
                        src={`/api/videos/${props.video.fileUrl}`}
                        visible={playing}
                        onPlaying={() => setPlaying(true)}
                    />
                )}
            </div>
            <Typography>{props.video.title}</Typography>
        </Link>
    );
}

type HoverPreviewProps = {
    src: string;
    visible: boolean;
    onPlaying: () => void;
};

const HoverPreview = ({ src, visible, onPlaying }: HoverPreviewProps) => {
    const ref = React.useRef<HTMLVideoElement>(null);

    // On unmount, actually abort the download (just removing the element isn't always enough)
    React.useEffect(() => {
        const v = ref.current;
        return () => {
            if (!v) return;
            v.pause();
            v.removeAttribute("src");
            v.load();
        };
    }, []);

    return (
        <video
            ref={ref}
            className={`${styles.Preview} ${visible ? styles.Visible : ""}`}
            src={src}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlaying={onPlaying}
        />
    );
};

export default VideoPart;
