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
import React, {useState} from "react";
import VideoPlayer from "@components/VideoPlayer/VideoPlayer";
import UploadInformationComponent from "@/app/(pages)/upload/UploadInformationComponent";
import GetAudioTracks, {CustomAudioTrack} from "@/app/(pages)/upload/_util/ListAudioTracks";
import {useRouter} from "next/navigation";

const UploadPage = () => {
    const router = useRouter();
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);

    const [file, setFile] = useState<File | null>(null);
    const [tracks, setTracks] = useState<CustomAudioTrack[]>([]);
    const [selectedTracks, setSelectedTracks] = useState<number[]>([]);

    const [localFile, setLocalFile] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [range, setRange] = useState([0, 0]);
    const videoRef = React.useRef<HTMLVideoElement>(null);

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

    const startUpload = (title: string, description: string) => {
        if (!file || uploading) return;

        setUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        const xhr = new XMLHttpRequest();

        xhr.open("POST", "/api/upload");
        xhr.setRequestHeader("x-upload-meta", encodeURIComponent(
            JSON.stringify({title, description, range, selectedTracks}),
        ));

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
        };
        xhr.upload.onload = () => setUploadProgress(100);

        xhr.onload = () => {
            setUploading(false);

            if (xhr.status !== 200) {
                setUploadError(xhr.responseText || `Upload failed (${xhr.status})`);
                return;
            }

            // Kind of required otherwise nextjs cache will reuse the same stuff
            if (localFile) URL.revokeObjectURL(localFile);
            setFile(null);
            setLocalFile(null);
            setTracks([]);
            setSelectedTracks([]);
            setDuration(0);
            setRange([0, 0]);
            setUploadProgress(0);

            router.push("/");
            router.refresh();
        };

        xhr.onerror = () => {
            setUploading(false);
            setUploadError("Network error");
        };

        xhr.send(file);
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
                        <Typography variant="caption">Upload: {uploadProgress}%</Typography>
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
