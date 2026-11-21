import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

import type { Cut } from "@/app/(api)/api/upload/_util/UploadMeta";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

type ConvertVideoOptions = {
    rawPath: string;
    outputPath: string;
    start: number;
    end: number;
    tracks: number[];
    cuts: Cut[];
    signal: AbortSignal;
    onProgress: (value: number) => void;
};

// Take the cuts, shift them onto the output timeline, clip to the window, drop anything outside
const buildPerTrackCuts = (tracks: number[], cuts: Cut[], start: number, end: number) => {
    const duration = end - start;

    const perTrack = new Map<number, {s: number; e: number}[]>();
    for (const n of tracks) perTrack.set(n, []);

    for (const c of cuts) {
        const bucket = perTrack.get(c.track);

        if (!bucket) continue; // cuts for dropped (muted) tracks are ignored

        const s = Math.max(0, c.start - start);
        const e = Math.min(duration, c.end - start);

        if (e - s > 0.001) bucket.push({s, e});
    }

    for (const [n, list] of perTrack) {
        list.sort((a, b) => a.s - b.s);

        const merged: {s: number; e: number}[] = [];

        for (const r of list) {
            const last = merged[merged.length - 1];
            if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
            else merged.push({s: r.s, e: r.e});
        }

        perTrack.set(n, merged);
    }

    return perTrack;
};

const buildAudioArgs = (tracks: number[], cuts: Cut[], start: number, end: number): string[] => {
    if (tracks.length === 0) return ["-an"];

    const perTrack = buildPerTrackCuts(tracks, cuts, start, end);
    const hasAnyCuts = [...perTrack.values()].some((list) => list.length > 0);

    // What to do if there's no cuts and it's a single track only.
    if (tracks.length === 1 && !hasAnyCuts) {
        return ["-map", `0:a:${tracks[0] - 1}`, "-c:a", "aac", "-b:a", "160k"];
    }

    const legs: string[] = [];
    for (let i = 0; i < tracks.length; i++) {
        const n = tracks[i];
        const regs = perTrack.get(n)!;

        const volChain = regs
            .map((r) => `volume=enable='between(t,${r.s.toFixed(3)},${r.e.toFixed(3)})':volume=0`)
            .join(",");

        const chain = volChain || "anull";

        legs.push(`[0:a:${n - 1}]${chain}[a${i}]`);
    }

    const labelRefs = tracks.map((_, i) => `[a${i}]`).join("");
    const tail = tracks.length === 1
        ? `${labelRefs}alimiter=limit=0.95[aout]`
        : `${labelRefs}amix=inputs=${tracks.length}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`;

    return [
        "-filter_complex", `${legs.join(";")};${tail}`,
        "-map", "[aout]",
        "-c:a", "aac", "-b:a", "192k",
    ];
};

const ConvertVideo = async (
    { rawPath, outputPath, start, end, tracks, cuts, signal, onProgress }: ConvertVideoOptions) => {

    if (signal.aborted) throw new Error("Upload canceled");

    const duration = end - start;
    if (!(duration > 0)) throw new Error("Conversion rejected: empty trim range");

    const audioArgs = buildAudioArgs(tracks, cuts, start, end);

    const args = [
        "-hide_banner", "-nostdin", "-y",

        // Trimming
        "-ss", String(start),
        "-t", String(duration),
        "-i", rawPath,

        // Track Selection
        "-map", "0:V:0",

        // Video Encoding
        "-c:v", "libx264",
        "-crf", "22",
        "-preset", "medium",
        "-pix_fmt", "yuv420p",
        "-fps_mode", "passthrough",
        "-vf", "scale=-2:min(1080\\,ih)",

        // Audio Encoding
        ...audioArgs,

        // For keeping track of progress basically
        "-progress", "pipe:1", "-nostats",

        "-movflags", "+faststart",
        "-f", "mp4",
        outputPath,
    ];

    const child = spawn(/*turbopackIgnore: true*/ FFMPEG, args, {
        signal,
        killSignal: "SIGKILL",
        stdio: ["ignore", "pipe", "pipe"],
    });

    // Parse progress (key=value lines)
    let stdoutBuf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
        stdoutBuf += chunk;
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop()!;
        for (const line of lines) {
            const [key, value] = line.trim().split("=");
            if (key === "out_time_us") {
                const seconds = Number(value) / 1_000_000;
                if (Number.isFinite(seconds)) {
                    onProgress(Math.min(1, Math.max(0, seconds / duration)));
                }
            } else if (key === "progress" && value === "end") {
                onProgress(1);
            }
        }
    });

    // Keep the tail of stderr for error messages
    let stderrTail = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-4000);
    });

    try {
        await new Promise<void>((resolve, reject) => {
            child.on("error", reject);
            child.on("close", (code) => {
                if (signal.aborted) reject(new Error("Upload canceled"));
                else if (code === 0) resolve();
                else reject(new Error(`Conversion rejected (ffmpeg exit ${code}): ${stderrTail.trim()}`));
            });
        });
    } catch (err) {
        await rm(outputPath, { force: true }); // don't leave a half-written file behind
        if (signal.aborted) throw new Error("Upload canceled");
        throw err;
    }
};

export default ConvertVideo;
