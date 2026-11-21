'use client';

import styles from "./TrimBar.module.scss";

import {Typography} from "@mui/material";
import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";

type TrimBarProps = {
    src: string;
    duration: number;
    range: [number, number];
    currentTime: number;
    onRangeChange: (next: [number, number], activeThumb: 0 | 1) => void;
}

const THUMB_TARGET_PX = 80;
const THUMB_COUNT_MIN = 6;
const THUMB_COUNT_MAX = 24;
const THUMB_HEIGHT = 90;

const MIN_CLIP_SECONDS = 0.05;

type DragKind = "in" | "out" | null;

const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const totalMs = Math.round(sec * 1000);
    const m = Math.floor(totalMs / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const cs = Math.floor((totalMs % 1000) / 10); // centiseconds, keeps things readable at this scale
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const TrimBar = (props: TrimBarProps) => {
    const {src, duration, range, currentTime, onRangeChange} = props;

    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<DragKind>(null);
    const [thumbState, setThumbState] = useState<{key: string; thumbs: string[]}>({key: "", thumbs: []});
    const [trackWidth, setTrackWidth] = useState(0);

    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const update = () => setTrackWidth(el.getBoundingClientRect().width);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const thumbCount = useMemo(() => {
        if (trackWidth <= 0) return 0;
        return Math.max(
            THUMB_COUNT_MIN,
            Math.min(THUMB_COUNT_MAX, Math.round(trackWidth / THUMB_TARGET_PX)),
        );
    }, [trackWidth]);

    const thumbKey = `${src}|${duration}|${thumbCount}`;
    const thumbnails = thumbState.key === thumbKey ? thumbState.thumbs : [];

    useEffect(() => {
        if (!src || duration <= 0 || thumbCount <= 0) return;

        let cancelled = false;
        const video = document.createElement("video");
        video.src = src;
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const waitForMetadata = () => new Promise<void>((resolve, reject) => {
            if (video.readyState >= 1) {
                resolve();
                return;
            }
            const onReady = () => {
                video.removeEventListener("loadedmetadata", onReady);
                video.removeEventListener("error", onError);
                resolve();
            };
            const onError = () => {
                video.removeEventListener("loadedmetadata", onReady);
                video.removeEventListener("error", onError);
                reject(new Error("metadata failed"));
            };
            video.addEventListener("loadedmetadata", onReady);
            video.addEventListener("error", onError);
        });

        const seekTo = (t: number) => new Promise<void>((resolve, reject) => {
            const onSeeked = () => {
                video.removeEventListener("seeked", onSeeked);
                video.removeEventListener("error", onError);
                resolve();
            };
            const onError = () => {
                video.removeEventListener("seeked", onSeeked);
                video.removeEventListener("error", onError);
                reject(new Error("seek failed"));
            };
            video.addEventListener("seeked", onSeeked);
            video.addEventListener("error", onError);
            video.currentTime = t;
        });

        (async () => {
            try {
                await waitForMetadata();
                if (cancelled) return;

                const vw = video.videoWidth || 160;
                const vh = video.videoHeight || 90;
                const scale = THUMB_HEIGHT / vh;
                canvas.width = Math.max(1, Math.round(vw * scale));
                canvas.height = THUMB_HEIGHT;

                const results: string[] = [];
                for (let i = 0; i < thumbCount; i++) {
                    if (cancelled) return;
                    const t = Math.max(0, Math.min(duration - 0.01, ((i + 0.5) / thumbCount) * duration));
                    await seekTo(t);
                    if (cancelled) return;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    try {
                        results.push(canvas.toDataURL("image/jpeg", 0.6));
                    } catch {
                        return;
                    }
                    if (!cancelled) setThumbState({key: thumbKey, thumbs: [...results]});
                }
            } catch {
            }
        })();

        return () => {
            cancelled = true;
            video.removeAttribute("src");
            video.load();
        };
    }, [src, duration, thumbCount, thumbKey]);

    const pxToTime = useCallback((clientX: number) => {
        const el = trackRef.current;
        if (!el || duration <= 0) return 0;
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        return (x / rect.width) * duration;
    }, [duration]);

    const startDrag = (which: Exclude<DragKind, null>) => (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(which);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const t = pxToTime(e.clientX);
        if (dragging === "in") {
            const next: [number, number] = [Math.min(t, range[1] - MIN_CLIP_SECONDS), range[1]];
            if (next[0] !== range[0]) onRangeChange(next, 0);
        } else {
            const next: [number, number] = [range[0], Math.max(t, range[0] + MIN_CLIP_SECONDS)];
            if (next[1] !== range[1]) onRangeChange(next, 1);
        }
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setDragging(null);
    };

    const pct = (t: number) => (duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0);
    const inPct = pct(range[0]);
    const outPct = pct(range[1]);
    const headPct = pct(currentTime);

    return (
        <div className={styles.TrimBar}>
            <div
                ref={trackRef}
                className={`${styles.Track} ${dragging ? styles.Dragging : ""}`}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <div className={styles.Filmstrip} aria-hidden>
                    {thumbnails.map((url, i) => (
                        <img
                            key={i}
                            className={styles.Frame}
                            src={url}
                            alt=""
                            draggable={false}
                        />
                    ))}
                </div>

                <div
                    className={styles.Dim}
                    style={{left: 0, width: `${inPct}%`}}
                    aria-hidden
                />
                <div
                    className={styles.Dim}
                    style={{left: `${outPct}%`, right: 0}}
                    aria-hidden
                />

                <div
                    className={styles.Selection}
                    style={{left: `${inPct}%`, right: `${100 - outPct}%`}}
                    aria-hidden
                />

                <div
                    className={styles.Playhead}
                    style={{left: `${headPct}%`}}
                    aria-hidden
                />

                <div
                    className={`${styles.Handle} ${styles.HandleIn}`}
                    style={{left: `${inPct}%`}}
                    onPointerDown={startDrag("in")}
                    role="slider"
                    tabIndex={0}
                    aria-label="In point"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={range[0]}
                >
                    <div className={styles.HandleGrip} />
                </div>
                <div
                    className={`${styles.Handle} ${styles.HandleOut}`}
                    style={{left: `${outPct}%`}}
                    onPointerDown={startDrag("out")}
                    role="slider"
                    tabIndex={0}
                    aria-label="Out point"
                    aria-valuemin={0}
                    aria-valuemax={duration}
                    aria-valuenow={range[1]}
                >
                    <div className={styles.HandleGrip} />
                </div>
            </div>

            <div className={styles.Labels}>
                <Typography variant="caption">In {formatTime(range[0])}</Typography>
                <Typography variant="caption">Clip {formatTime(Math.max(0, range[1] - range[0]))}</Typography>
                <Typography variant="caption">Out {formatTime(range[1])}</Typography>
            </div>
        </div>
    );
}

export default TrimBar;
