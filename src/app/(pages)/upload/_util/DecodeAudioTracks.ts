import { Input, ALL_FORMATS, BlobSource, AudioBufferSink } from "mediabunny";

export type DecodedAudioTrack = {
    number: number; // 1-indexed
    buffer: AudioBuffer;
    peaks: Float32Array;
};

// waveform sampling rate
export const WAVEFORM_BUCKETS = 1024;

export type TrackDecodeStatus =
    | { kind: "loading" }
    | { kind: "ready"; track: DecodedAudioTrack }
    | { kind: "unavailable"; reason: string };

export type DecodeCallbacks = {
    onTrackReady: (track: DecodedAudioTrack) => void;
    onTrackUnavailable: (trackNumber: number, reason: string) => void;
};

export const decodeAudioTracks = async (file: File, trackNumbers: number[], audioCtx: AudioContext, callbacks: DecodeCallbacks, signal: AbortSignal): Promise<void> => {
    if (trackNumbers.length === 0) return;

    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const allTracks = await input.getAudioTracks();

    for (const number of trackNumbers) {
        if (signal.aborted) return;
        const track = allTracks.find((t) => t.number === number);
        if (!track) {
            callbacks.onTrackUnavailable(number, "Track not found");
            continue;
        }

        try {
            if (!(await track.canDecode())) {
                callbacks.onTrackUnavailable(number, "Codec not supported for preview");
                continue;
            }

            const [duration, sampleRate, numberOfChannels] = await Promise.all([
                track.computeDuration(),
                track.getSampleRate(),
                track.getNumberOfChannels(),
            ]);
            if (signal.aborted) return;
            if (!(duration > 0) || !(sampleRate > 0) || !(numberOfChannels > 0)) {
                callbacks.onTrackUnavailable(number, "Empty track");
                continue;
            }

            const totalFrames = Math.ceil(duration * sampleRate);
            const buffer = audioCtx.createBuffer(numberOfChannels, totalFrames, sampleRate);
            const channels: Float32Array[] = [];
            for (let c = 0; c < numberOfChannels; c++) channels.push(buffer.getChannelData(c));

            const sink = new AudioBufferSink(track);

            for await (const wrapped of sink.buffers()) {
                if (signal.aborted) return;

                const offsetFrames = Math.round(wrapped.timestamp * sampleRate);
                if (offsetFrames >= totalFrames) continue;

                const copyLen = Math.min(wrapped.buffer.length, totalFrames - offsetFrames);
                const ch = Math.min(numberOfChannels, wrapped.buffer.numberOfChannels);

                for (let c = 0; c < ch; c++) {
                    channels[c].set(wrapped.buffer.getChannelData(c).subarray(0, copyLen), offsetFrames);
                }
            }
            if (signal.aborted) return;

            const peaks = new Float32Array(WAVEFORM_BUCKETS);
            const framesPerBucket = Math.max(1, Math.floor(totalFrames / WAVEFORM_BUCKETS));

            for (let b = 0; b < WAVEFORM_BUCKETS; b++) {
                const startFrame = b * framesPerBucket;
                const endFrame = Math.min(totalFrames, startFrame + framesPerBucket);
                let maxAbs = 0;

                for (let c = 0; c < numberOfChannels; c++) {
                    const data = channels[c];

                    for (let f = startFrame; f < endFrame; f++) {
                        const a = data[f] < 0 ? -data[f] : data[f];
                        if (a > maxAbs) maxAbs = a;
                    }
                }

                peaks[b] = maxAbs;
            }

            callbacks.onTrackReady({ number, buffer, peaks });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Decode failed";
            callbacks.onTrackUnavailable(number, message);
        }
    }
};
