'use client';

import styles from "./Upload.module.scss";

import {
    Button,
    Checkbox,
    Dialog, DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    FormGroup, LinearProgress,
    Slider,
    Typography
} from "@mui/material";
import React, {useEffect, useRef, useState} from "react";
import VideoPlayer from "@components/VideoPlayer/VideoPlayer";
import UploadInformationComponent from "@/app/(pages)/upload/UploadInformationComponent";
import GetAudioTracks, {CustomAudioTrack} from "@/app/(pages)/upload/_util/ListAudioTracks";
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
    const [selectedTracks, setSelectedTracks] = useState<number[]>([]);

    const [localFile, setLocalFile] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [range, setRange] = useState([0, 0]);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    // Shared abort controller for the active upload. The use effect cleanup triggers it if the component is unmounted
    // For example if a user leaves the page or something
    const uploadAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            uploadAbortRef.current?.abort();
        };
    }, []);

    const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setLocalFile(URL.createObjectURL(f));

        const found = await GetAudioTracks(f);
        setTracks(found);
        setSelectedTracks(found.map((t) => t.number)); // keep all by default
    };

    const toggleTrack = (index: number) =>
        setSelectedTracks((prev) =>
            prev.includes(index)
                ? prev.filter((i) => i !== index)
                : [...prev, index].sort((a, b) => a - b)
        );

    const onLoadedVideo = (e: any) => {
        if (!videoRef.current) return;
        const duration = videoRef.current.duration;
        setDuration(duration);
        setRange([0, duration]);
    }

    const onRangeChange = (_: Event, value: number | number[], activeThumb: number) => {
        if (!Array.isArray(value)) return;
        setRange(value);
        console.log(activeThumb);
        if (videoRef.current) videoRef.current.currentTime = value[activeThumb];
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
        if (!v || v.paused) return;
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
            setFile(null);
            setLocalFile(null);
            setTracks([]);
            setSelectedTracks([]);
            setDuration(0);
            setRange([0, 0]);
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
                            <Slider
                                value={range}
                                onChange={onRangeChange}
                                min={0}
                                max={duration}
                                step={0.1}
                                disableSwap={true}
                                valueLabelDisplay="auto"
                            />
                        </div>

                        <div className={styles.Right}>
                            <UploadInformationComponent onSubmit={startUpload} />

                            {tracks.length > 0 && (
                                <div className={styles.Tracks}>
                                    <Typography variant="subtitle2">Audio tracks to keep</Typography>
                                    <FormGroup className={styles.TracksGroup}>
                                        {tracks.map((t) => (
                                            <FormControlLabel
                                                key={t.number}
                                                control={
                                                    <Checkbox
                                                        checked={selectedTracks.includes(t.number)}
                                                        onChange={() => toggleTrack(t.number)}
                                                    />
                                                }
                                                label={`Track ${t.number}${t.name ? ` – ${t.name}` : ""} (${t.codec})`}
                                            />
                                        ))}
                                    </FormGroup>
                                </div>
                            )}
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
