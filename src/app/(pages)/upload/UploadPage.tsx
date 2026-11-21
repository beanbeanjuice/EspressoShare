'use client';

import styles from "./Upload.module.scss";

import {
    Button,
    Dialog, DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Typography
} from "@mui/material";
import React, {useEffect, useMemo, useRef, useState} from "react";
import VideoPlayer from "@components/VideoPlayer/VideoPlayer";
import UploadInformationComponent from "@/app/(pages)/upload/UploadInformationComponent";
import TrimBar from "@/app/(pages)/upload/TrimBar";
import AudioEditor, {type ClientCut} from "@/app/(pages)/upload/AudioEditor";
import GetAudioTracks, {CustomAudioTrack} from "@/app/(pages)/upload/_util/ListAudioTracks";
import {decodeAudioTracks, type DecodedAudioTrack, type TrackDecodeStatus} from "@/app/(pages)/upload/_util/DecodeAudioTracks";
import useAudioPreview from "@/app/(pages)/upload/_util/useAudioPreview";
import {uploadChunks} from "@/app/(pages)/upload/_util/UploadChunks";
import {useRouter} from "next/navigation";

const CONCURRENCY = 4;
const MAX_RETRIES = 3;

const UploadPage = () => {
    const router = useRouter();
    const [uploading, setUploading] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [file, setFile] = useState<File | null>(null);
    const [tracks, setTracks] = useState<CustomAudioTrack[]>([]);

    const [localFile, setLocalFile] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [range, setRange] = useState<[number, number]>([0, 0]);
    const [currentTime, setCurrentTime] = useState(0);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    const [mutedTracks, setMutedTracks] = useState<Set<number>>(new Set());
    const [soloedTracks, setSoloedTracks] = useState<Set<number>>(new Set());
    const [cuts, setCuts] = useState<ClientCut[]>([]);
    const [decodeStatus, setDecodeStatus] = useState<Map<number, TrackDecodeStatus>>(new Map());
    const decodeAbortRef = useRef<AbortController | null>(null);

    const uploadAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            uploadAbortRef.current?.abort();
            decodeAbortRef.current?.abort();
        };
    }, []);

    const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setLocalFile(URL.createObjectURL(f));
        setMutedTracks(new Set());
        setSoloedTracks(new Set());
        setCuts([]);

        const found = await GetAudioTracks(f);
        setTracks(found);

        decodeAbortRef.current?.abort();
        const abort = new AbortController();
        decodeAbortRef.current = abort;
        setDecodeStatus(new Map(found.map((t) => [t.number, {kind: "loading"} as TrackDecodeStatus])));

        if (typeof window !== "undefined") {
            try {
                const ctx = new AudioContext();
                void decodeAudioTracks(
                    f,
                    found.map((t) => t.number),
                    ctx,
                    {
                        onTrackReady: (track) => {
                            setDecodeStatus((prev) => {
                                const next = new Map(prev);
                                next.set(track.number, {kind: "ready", track});
                                return next;
                            });
                        },
                        onTrackUnavailable: (trackNumber, reason) => {
                            setDecodeStatus((prev) => {
                                const next = new Map(prev);
                                next.set(trackNumber, {kind: "unavailable", reason});
                                return next;
                            });
                        },
                    },
                    abort.signal,
                );
            } catch {
                // No Web Audio support at all. Mark every track as unavailable; the edit
                // list still flows to the server.
                setDecodeStatus(new Map(found.map((t) => [t.number, {kind: "unavailable", reason: "Web Audio not available"}])));
            }
        }
    };

    const onLoadedVideo = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = true;

        setDuration(v.duration);
        setRange([0, v.duration]);
        setCurrentTime(0);
    }

    const decodedTracks = useMemo(() => {
        const out = new Map<number, DecodedAudioTrack>();
        for (const [n, status] of decodeStatus) {
            if (status.kind === "ready") out.set(n, status.track);
        }
        return out;
    }, [decodeStatus]);

    useAudioPreview({
        videoRef,
        src: localFile,
        decodedTracks,
        mutedTracks,
        soloedTracks,
        cuts,
    });

    const toggleMuted = (track: number) => setMutedTracks((prev) => {
        const next = new Set(prev);
        if (next.has(track)) next.delete(track); else next.add(track);
        return next;
    });

    const toggleSoloed = (track: number) => setSoloedTracks((prev) => {
        const next = new Set(prev);
        if (next.has(track)) next.delete(track); else next.add(track);
        return next;
    });

    const addCut = (cut: ClientCut) => setCuts((prev) => [...prev, cut]);

    const updateCut = (id: string, next: {start: number; end: number}) => setCuts((prev) =>
        prev.map((c) => c.id === id ? {...c, start: next.start, end: next.end} : c)
    );

    const deleteCut = (id: string) => setCuts((prev) => prev.filter((c) => c.id !== id));

    const onRangeChange = (next: [number, number]) => {
        setRange(next);
    }

    const onPlay = () => {
        const v = videoRef.current;
        if (!v) return;
        // If playback starts outside the range, jump to the start point
        if (v.currentTime < range[0] || v.currentTime >= range[1]) {
            v.currentTime = range[0];
        }
    };

    const onTimeUpdate = () => {
        const v = videoRef.current;
        if (!v) return;
        setCurrentTime(v.currentTime);

        if (v.paused) return;
        if (v.currentTime >= range[1]) {
            v.pause();
            v.currentTime = range[0]; // reset so the next play starts at the start point
        } else if (v.currentTime < range[0]) {
            v.currentTime = range[0]; // user scrubbed before the start
        }
    };

    const startUpload = async (title: string, description: string) => {
        if (!file || uploading) return;

        setUploading(true);
        setFinalizing(false);
        setUploadProgress(0);
        setUploadSpeed(null);
        setUploadError(null);

        const abortController = new AbortController();
        uploadAbortRef.current = abortController;

        const selectedTracks = tracks.map((t) => t.number).filter((n) => !mutedTracks.has(n));
        const uploadCuts = cuts
            .filter((c) => selectedTracks.includes(c.track))
            .map((c) => ({track: c.track, start: c.start, end: c.end}));

        try {
            // 1. We want to reserve an upload id server-side and learn the chunking plan.
            const initRes = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title,
                    description: description,
                    range: range,
                    selectedTracks: selectedTracks,
                    cuts: uploadCuts,
                    size: file.size,
                    fileName: file.name,
                }),
                signal: abortController.signal,
            });

            if (!initRes.ok) {
                const text = await initRes.text().catch(() => "");
                throw new Error(text || `Upload failed (${initRes.status})`);
            }

            const { uploadId, chunkSize, totalChunks } = await initRes.json() as {
                uploadId: string; chunkSize: number; totalChunks: number;
            };

            // 2. Chunks.
            // We want to combine the uploaded chunks together to get total progress.
            const inFlight = new Map<number, number>();
            let completedBytes = 0;
            let lastLoaded = 0;
            let lastTime = performance.now();
            let smoothedSpeed: number | null = null;

            const totalSize = file.size;

            const emitProgress = () => {
                let loaded = completedBytes;
                for (const v of inFlight.values()) loaded += v;
                if (loaded > totalSize) loaded = totalSize;

                setUploadProgress(Math.round((loaded / totalSize) * 100));

                const now = performance.now();
                const elapsed = (now - lastTime) / 1000;
                if (elapsed >= 0.5) {
                    const inst = (loaded - lastLoaded) / elapsed;
                    smoothedSpeed = smoothedSpeed === null ? inst : smoothedSpeed * 0.7 + inst * 0.3;
                    setUploadSpeed(smoothedSpeed);
                    lastLoaded = loaded;
                    lastTime = now;
                }
            };

            await uploadChunks({
                uploadId: uploadId,
                file: file,
                chunkSize: chunkSize,
                totalChunks: totalChunks,
                concurrency: CONCURRENCY,
                maxRetries: MAX_RETRIES,
                onChunkProgress: (index, loaded) => {
                    inFlight.set(index, loaded);
                    emitProgress();
                },
                onChunkComplete: (index, size) => {
                    completedBytes += size;
                    inFlight.delete(index);
                    emitProgress();
                },
                signal: abortController.signal,
            });

            setUploadProgress(100);
            setFinalizing(true);

            // 3. This should be done, the server should run the probe and transcode and etc
            const completeRes = await fetch(`/api/upload/${uploadId}/complete`, {
                method: "POST",
                signal: abortController.signal,
            });

            if (!completeRes.ok) {
                const text = await completeRes.text().catch(() => "");
                throw new Error(text || `Upload failed (${completeRes.status})`);
            }

            // Success at this point. Reset and navigate home
            if (localFile) URL.revokeObjectURL(localFile);
            decodeAbortRef.current?.abort();
            setFile(null);
            setLocalFile(null);
            setTracks([]);
            setMutedTracks(new Set());
            setSoloedTracks(new Set());
            setCuts([]);
            setDecodeStatus(new Map());
            setDuration(0);
            setRange([0, 0]);
            setCurrentTime(0);
            setUploadProgress(0);
            setUploadSpeed(null);
            setFinalizing(false);
            setUploading(false);

            router.push("/");
            router.refresh();
        } catch (error) {
            if (abortController.signal.aborted) {
                // Someone moved away mid-upload so there's nothing to show
                return;
            }
            setUploadError(error instanceof Error && error.message ? error.message : "Upload failed");
            setUploadSpeed(null);
            setFinalizing(false);
            setUploading(false);
        } finally {
            if (uploadAbortRef.current === abortController) {
                uploadAbortRef.current = null;
            }
        }
    };

    return (
        <div className={styles.UploadPage}>
            {
                !localFile && (
                    <Button variant="contained" component="label">
                        Choose Video
                        <input type="file" accept="video/*" hidden onChange={onPickVideo} />
                    </Button>
                )
            }

            {localFile && (
                <>
                    <div className={styles.Content}>
                        <div className={styles.Left}>
                            <VideoPlayer
                                ref={videoRef}
                                src={localFile}
                                controls={true}
                                onLoadedMetadata={onLoadedVideo}
                                onPlay={onPlay}
                                onTimeUpdate={onTimeUpdate}
                            />
                            <TrimBar
                                src={localFile}
                                duration={duration}
                                range={range}
                                currentTime={currentTime}
                                onRangeChange={onRangeChange}
                            />
                            <AudioEditor
                                duration={duration}
                                tracks={tracks}
                                decodeStatus={decodeStatus}
                                mutedTracks={mutedTracks}
                                soloedTracks={soloedTracks}
                                cuts={cuts}
                                range={range}
                                currentTime={currentTime}
                                onToggleMuted={toggleMuted}
                                onToggleSoloed={toggleSoloed}
                                onAddCut={addCut}
                                onUpdateCut={updateCut}
                                onDeleteCut={deleteCut}
                            />
                        </div>

                        <div className={styles.Right}>
                            <UploadInformationComponent onSubmit={startUpload} />
                        </div>
                    </div>
                </>
            )}

            <Dialog open={uploading || uploadError !== null}>
                <DialogTitle>{uploadError ? "Upload failed" : "Uploading video"}</DialogTitle>
                <DialogContent sx={{display: "grid", gap: 2, minWidth: 320}}>
                    <div>
                        <Typography variant="caption">
                            {finalizing
                                ? "Finalizing…"
                                : (
                                    <>
                                        {`Upload: ${uploadProgress}%`}
                                        {uploadSpeed !== null && ` - ${(uploadSpeed / 1024 / 1024).toFixed(1)} MB/s`}
                                        {uploadSpeed !== null && uploadProgress < 100 && file && (() => {
                                            const etaSec = Math.round(file.size * (1 - uploadProgress / 100) / uploadSpeed);
                                            return ` - ${Math.floor(etaSec / 60)}:${String(etaSec % 60).padStart(2, '0')} left`;
                                        })()}
                                    </>
                                )
                            }
                        </Typography>
                        <LinearProgress variant="determinate" value={uploadProgress} />
                    </div>
                    {uploadError && <Typography color="error">{uploadError}</Typography>}
                </DialogContent>
                {uploadError && (
                    <DialogActions>
                        <Button onClick={() => setUploadError(null)}>Close</Button>
                    </DialogActions>
                )}
            </Dialog>
        </div>
    );
}

export default UploadPage;
