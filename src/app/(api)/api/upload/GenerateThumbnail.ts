import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

type GenerateThumbnailOptions = {
    videoPath: string;
    outputPath: string;
    duration: number;
    width?: number;
    height?: number;
    signal?: AbortSignal;
};

const GenerateThumbnail = async (
    { videoPath, outputPath, duration, width = 1920, height = 1080, signal }: GenerateThumbnailOptions) => {

    if (signal?.aborted) throw new Error("Upload canceled");

    const seek = 0; // the (second) frame which we are choosing the thumbnail

    const filters = [
        // Pick the most representative frame of the next 50
        "thumbnail=n=50",
        // Fit inside width×height without distorting
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        // Pad to exactly width×height, centered, black bars
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
        "setsar=1",
    ].join(",");

    const args = [
        "-hide_banner", "-nostdin", "-y", "-v", "error",
        "-ss", seek.toFixed(3),
        "-i", videoPath,
        "-map", "0:V:0",
        "-vf", filters,
        "-frames:v", "1",
        "-c:v", "libwebp",
        "-quality", "80",
        "-compression_level", "6",
        "-f", "webp",
        outputPath,
    ];

    const child = spawn(/*turbopackIgnore: true*/ FFMPEG, args, {
        signal,
        killSignal: "SIGKILL",
        stdio: ["ignore", "ignore", "pipe"],
    });

    let stderrTail = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-4000);
    });

    try {
        await new Promise<void>((resolve, reject) => {
            child.on("error", reject);
            child.on("close", (code) => {
                if (signal?.aborted) reject(new Error("Upload canceled"));
                else if (code === 0) resolve();
                else reject(new Error(`Thumbnail failed (ffmpeg exit ${code}): ${stderrTail.trim()}`));
            });
        });
    } catch (err) {
        await rm(outputPath, { force: true });
        if (signal?.aborted) throw new Error("Upload canceled");
        throw err;
    }
};

export default GenerateThumbnail;
