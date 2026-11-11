import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

type FfprobeOutput = {
    format: { duration?: string };
    streams: { codec_type: string; duration?: string }[];
};

const ProbeVideo = async (path: string) => {
    const { stdout } = await execFileAsync(FFPROBE, [
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        path,
    ]);

    const info = JSON.parse(stdout) as FfprobeOutput;

    const duration = Number(info.format.duration)
        || Math.max(0, ...info.streams.map((s) => Number(s.duration) || 0));

    const audio = info.streams.filter((s) => s.codec_type === "audio");

    return {
        duration,
        trackNumbers: audio.map((_, i) => i + 1), // Convert to 1 based indexing like mediabunny, maybe we can change this later
    };
};

export default ProbeVideo;
