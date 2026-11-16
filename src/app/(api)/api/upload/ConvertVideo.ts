import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

type ConvertVideoOptions = {
    rawPath: string;
    outputPath: string;
    start: number;
    end: number;
    tracks: number[];
    signal: AbortSignal;
    onProgress: (value: number) => void;
};

const ConvertVideo = async (
    { rawPath, outputPath, start, end, tracks, signal, onProgress }: ConvertVideoOptions) => {

    if (signal.aborted) throw new Error("Upload canceled");

    const duration = end - start;
    if (!(duration > 0)) throw new Error("Conversion rejected: empty trim range");

    const audioArgs =
        tracks.length === 0
            ? ["-an"]
            : tracks.length === 1
                ? ["-map", `0:a:${tracks[0] - 1}`, "-c:a", "aac", "-b:a", "160k"]
                : [
                    "-filter_complex",
                    `${tracks.map((n) => `[0:a:${n - 1}]`).join("")}` +
                    `amix=inputs=${tracks.length}:duration=longest:normalize=0,` +
                    `alimiter=limit=0.95[aout]`,
                    "-map", "[aout]",
                    "-c:a", "aac", "-b:a", "192k",
                ];

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
