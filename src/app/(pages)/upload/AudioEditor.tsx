'use client';

import styles from "./AudioEditor.module.scss";

import {Button, IconButton, Typography} from "@mui/material";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CloseIcon from "@mui/icons-material/Close";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import React, {useCallback, useEffect, useRef, useState} from "react";

import type {CustomAudioTrack} from "@/app/(pages)/upload/_util/ListAudioTracks";
import {type Cut, makeCutId, MIN_CUT_SECONDS} from "@/app/(pages)/upload/_util/AudioEdits";
import type {TrackDecodeStatus} from "@/app/(pages)/upload/_util/DecodeAudioTracks";

export type ClientCut = Cut & { id: string };

type AudioEditorProps = {
    duration: number;
    tracks: CustomAudioTrack[];
    decodeStatus: Map<number, TrackDecodeStatus>;
    mutedTracks: Set<number>;
    soloedTracks: Set<number>;
    cuts: ClientCut[];
    range: [number, number];
    currentTime: number;
    onToggleMuted: (track: number) => void;
    onToggleSoloed: (track: number) => void;
    onAddCut: (cut: ClientCut) => void;
    onUpdateCut: (id: string, next: {start: number; end: number}) => void;
    onDeleteCut: (id: string) => void;
}

const DEFAULT_REGION_FRACTION = 0.10;

type DragKind = "move" | "left" | "right";

type RegionDragState = {
    id: string;
    kind: DragKind;
    anchor: {start: number; end: number; pointerX: number};
}

const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const totalMs = Math.round(sec * 1000);
    const m = Math.floor(totalMs / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const cs = Math.floor((totalMs % 1000) / 10);
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const AudioEditor = (props: AudioEditorProps) => {
    const {
        duration,
        tracks,
        decodeStatus,
        mutedTracks,
        soloedTracks,
        cuts,
        range,
        currentTime,
        onToggleMuted,
        onToggleSoloed,
        onAddCut,
        onUpdateCut,
        onDeleteCut,
    } = props;

    if (tracks.length === 0) return null;

    return (
        <div className={styles.AudioEditor}>
            {tracks.map((track) => (
                <TrackLane
                    key={track.number}
                    track={track}
                    duration={duration}
                    status={decodeStatus.get(track.number)}
                    muted={mutedTracks.has(track.number)}
                    soloed={soloedTracks.has(track.number)}
                    cuts={cuts.filter((c) => c.track === track.number)}
                    range={range}
                    currentTime={currentTime}
                    onToggleMuted={() => onToggleMuted(track.number)}
                    onToggleSoloed={() => onToggleSoloed(track.number)}
                    onAddCut={onAddCut}
                    onUpdateCut={onUpdateCut}
                    onDeleteCut={onDeleteCut}
                />
            ))}
        </div>
    );
}

type TrackLaneProps = {
    track: CustomAudioTrack;
    duration: number;
    status: TrackDecodeStatus | undefined;
    muted: boolean;
    soloed: boolean;
    cuts: ClientCut[];
    range: [number, number];
    currentTime: number;
    onToggleMuted: () => void;
    onToggleSoloed: () => void;
    onAddCut: (cut: ClientCut) => void;
    onUpdateCut: (id: string, next: {start: number; end: number}) => void;
    onDeleteCut: (id: string) => void;
}

const TrackLane = (props: TrackLaneProps) => {
    const {track, duration, status, muted, soloed, cuts, range, currentTime, onToggleMuted, onToggleSoloed, onAddCut, onUpdateCut, onDeleteCut} = props;

    const laneRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<RegionDragState | null>(null);

    const laneWidthRef = useRef(0);
    useEffect(() => {
        const el = laneRef.current;
        if (!el) return;
        const update = () => { laneWidthRef.current = el.getBoundingClientRect().width; };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const pxToTime = useCallback((clientX: number) => {
        const el = laneRef.current;
        if (!el || duration <= 0) return 0;
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        return (x / rect.width) * duration;
    }, [duration]);

    const deltaPxToTime = useCallback((px: number) => {
        const w = laneWidthRef.current;
        if (w <= 0 || duration <= 0) return 0;
        return (px / w) * duration;
    }, [duration]);

    const addRegionAtCenter = () => {
        if (duration <= 0) return;
        const width = Math.min(duration, Math.max(MIN_CUT_SECONDS, duration * DEFAULT_REGION_FRACTION));
        const start = Math.max(0, Math.min(duration - width, (duration - width) / 2));
        onAddCut({id: makeCutId(), track: track.number, start, end: start + width});
    };

    const beginDrag = (cut: ClientCut, kind: DragKind) => (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragState({
            id: cut.id,
            kind,
            anchor: {start: cut.start, end: cut.end, pointerX: e.clientX},
        });
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState) return;
        const target = cuts.find((c) => c.id === dragState.id);
        if (!target) return;

        const dt = deltaPxToTime(e.clientX - dragState.anchor.pointerX);
        const {start: s0, end: e0} = dragState.anchor;

        let nextStart = s0;
        let nextEnd = e0;

        if (dragState.kind === "move") {
            const width = e0 - s0;
            nextStart = Math.max(0, Math.min(duration - width, s0 + dt));
            nextEnd = nextStart + width;
        } else if (dragState.kind === "left") {
            nextStart = Math.max(0, Math.min(e0 - MIN_CUT_SECONDS, s0 + dt));
            nextEnd = e0;
        } else {
            nextEnd = Math.max(s0 + MIN_CUT_SECONDS, Math.min(duration, e0 + dt));
            nextStart = s0;
        }

        if (nextStart !== target.start || nextEnd !== target.end) {
            onUpdateCut(dragState.id, {start: nextStart, end: nextEnd});
        }
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragState) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setDragState(null);
    };

    const previewUnavailable = status?.kind === "unavailable";
    const loading = !status || status.kind === "loading";
    const peaks = status?.kind === "ready" ? status.track.peaks : null;

    const laneLabel = `Track ${track.number}${track.name ? ` – ${track.name}` : ""} (${track.codec})`;

    const pct = (t: number) => (duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0);
    const inPct = pct(range[0]);
    const outPct = pct(range[1]);
    const headPct = pct(currentTime);

    return (
        <div className={`${styles.Lane} ${previewUnavailable ? styles.LaneUnavailable : ""}`}>
            <div className={styles.LaneHeader}>
                <Typography variant="caption" className={styles.LaneTitle} title={laneLabel}>
                    {laneLabel}
                </Typography>
                <div className={styles.LaneControls}>
                    <IconButton
                        size="small"
                        onClick={onToggleMuted}
                        title={muted ? "Unmute (keeps in upload)" : "Mute (drops from upload)"}
                        aria-label={muted ? "Unmute track" : "Mute track"}
                        className={`${styles.ToggleButton} ${styles.MuteButton} ${muted ? styles.ToggleActive : ""}`}
                    >
                        {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={onToggleSoloed}
                        title={soloed ? "Unsolo (preview only)" : "Solo (preview only)"}
                        aria-label={soloed ? "Unsolo track" : "Solo track"}
                        className={`${styles.ToggleButton} ${styles.SoloButton} ${soloed ? styles.ToggleActive : ""}`}
                    >
                        {soloed ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                    </IconButton>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCutIcon fontSize="small" />}
                        onClick={addRegionAtCenter}
                        disabled={duration <= 0}
                    >
                        Create new mute region
                    </Button>
                </div>
            </div>

            <div
                ref={laneRef}
                className={`${styles.LaneTrack} ${muted ? styles.LaneTrackMuted : ""}`}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <Waveform peaks={peaks} />

                <div
                    className={styles.RangeDim}
                    style={{left: 0, width: `${inPct}%`}}
                    aria-hidden
                />
                <div
                    className={styles.RangeDim}
                    style={{left: `${outPct}%`, right: 0}}
                    aria-hidden
                />
                <div
                    className={styles.RangeSelection}
                    style={{left: `${inPct}%`, right: `${100 - outPct}%`}}
                    aria-hidden
                />

                {loading && (
                    <div className={styles.LaneStatus} aria-hidden>
                        <Typography variant="caption">Decoding audio…</Typography>
                    </div>
                )}
                {previewUnavailable && (
                    <div className={styles.LaneStatus} aria-hidden>
                        <Typography variant="caption">
                            Preview unavailable {status?.kind === "unavailable" ? `(${status.reason})` : ""}. Edits still apply on upload.
                        </Typography>
                    </div>
                )}

                {cuts.map((cut) => (
                    <Region
                        key={cut.id}
                        cut={cut}
                        duration={duration}
                        pxToTime={pxToTime}
                        onBeginDrag={beginDrag}
                        onDelete={() => onDeleteCut(cut.id)}
                    />
                ))}

                <div
                    className={styles.Playhead}
                    style={{left: `${headPct}%`}}
                    aria-hidden
                />
            </div>
        </div>
    );
}

type WaveformProps = {
    peaks: Float32Array | null;
}

const Waveform = ({peaks}: WaveformProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let frame = 0;

        const draw = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const w = Math.max(1, Math.floor(rect.width * dpr));
            const h = Math.max(1, Math.floor(rect.height * dpr));
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;

            ctx.clearRect(0, 0, w, h);
            if (!peaks || peaks.length === 0) return;

            ctx.fillStyle = "rgba(245, 197, 24, 0.75)";
            const mid = h / 2;
            const barWidth = Math.max(1, Math.floor(w / peaks.length));
            for (let i = 0; i < peaks.length; i++) {
                const x = Math.floor((i / peaks.length) * w);
                const amp = Math.min(1, peaks[i]);
                const barHeight = Math.max(1, Math.floor(amp * (h - 2)));
                ctx.fillRect(x, mid - barHeight / 2, barWidth, barHeight);
            }
        };

        draw();
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(draw);
        });
        ro.observe(canvas);
        return () => { ro.disconnect(); cancelAnimationFrame(frame); };
    }, [peaks]);

    return <canvas ref={canvasRef} className={styles.Waveform} aria-hidden />;
}

type RegionProps = {
    cut: ClientCut;
    duration: number;
    pxToTime: (clientX: number) => number;
    onBeginDrag: (cut: ClientCut, kind: DragKind) => (e: React.PointerEvent<HTMLDivElement>) => void;
    onDelete: () => void;
}

const Region = ({cut, duration, onBeginDrag, onDelete}: RegionProps) => {
    const leftPct = duration > 0 ? (cut.start / duration) * 100 : 0;
    const rightPct = duration > 0 ? 100 - (cut.end / duration) * 100 : 100;

    const onDeleteClick = (e: React.PointerEvent<HTMLButtonElement>) => {
        // Pointer-based close so it beats pointer-capture on the surrounding region.
        e.preventDefault();
        e.stopPropagation();
        onDelete();
    };

    return (
        <div
            className={styles.Region}
            style={{left: `${leftPct}%`, right: `${rightPct}%`}}
            onPointerDown={onBeginDrag(cut, "move")}
            role="group"
            aria-label={`Mute region ${formatTime(cut.start)} to ${formatTime(cut.end)}`}
        >
            <div
                className={`${styles.RegionEdge} ${styles.RegionEdgeLeft}`}
                onPointerDown={onBeginDrag(cut, "left")}
                aria-label="Resize start"
            />
            <div
                className={`${styles.RegionEdge} ${styles.RegionEdgeRight}`}
                onPointerDown={onBeginDrag(cut, "right")}
                aria-label="Resize end"
            />
            <div className={styles.RegionBody}>
                <Typography variant="caption" className={styles.RegionTime}>
                    {formatTime(cut.start)} - {formatTime(cut.end)}
                </Typography>
            </div>
            <IconButton
                size="small"
                className={styles.RegionDelete}
                onPointerDown={onDeleteClick}
                title="Delete region"
                aria-label="Delete region"
            >
                <CloseIcon fontSize="small" />
            </IconButton>
        </div>
    );
}

export default AudioEditor;
