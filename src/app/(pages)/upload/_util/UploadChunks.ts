export type ChunkUploadOptions = {
    uploadId: string;
    file: File;
    chunkSize: number;
    totalChunks: number;
    concurrency: number;
    maxRetries: number;
    onChunkProgress: (index: number, loaded: number) => void; // in-flight chunk's loaded-bytes ticks.
    onChunkComplete: (index: number, size: number) => void; // when a chunk is fully accepted by the server.
    signal: AbortSignal;
};

export class ChunkUploadError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new ChunkUploadError("aborted"));
            return;
        }

        const t = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);

        const onAbort = () => {
            clearTimeout(t);
            reject(new ChunkUploadError("aborted"));
        };

        signal.addEventListener("abort", onAbort, { once: true });
    });

const putChunk = (uploadId: string, index: number, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void) =>
    new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(new ChunkUploadError("aborted"));
            return;
        }

        const xhr = new XMLHttpRequest();
        const onAbort = () => xhr.abort();
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        signal.addEventListener("abort", onAbort, { once: true });

        xhr.open("PUT", `/api/upload/${uploadId}?index=${index}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(event.loaded);
        };

        xhr.onload = () => {
            cleanup();

            if (xhr.status === 204) {
                onProgress(blob.size);
                resolve();
            } else {
                reject(new ChunkUploadError(
                    xhr.responseText || `Chunk ${index} failed (${xhr.status})`,
                    xhr.status,
                ));
            }
        };

        xhr.onerror = () => {
            cleanup();
            reject(new ChunkUploadError("Network error"));
        };

        xhr.onabort = () => {
            cleanup();
            reject(new ChunkUploadError("aborted"));
        };

        xhr.send(blob);
    });

export const uploadChunks = async (options: ChunkUploadOptions) => {
    const {
        uploadId,
        file,
        chunkSize,
        totalChunks,
        concurrency,
        maxRetries,
        onChunkProgress,
        onChunkComplete,
        signal,
    } = options;

    let nextIndex = 0;

    const worker = async () => {
        while (true) {
            if (signal.aborted) throw new ChunkUploadError("aborted");

            const index = nextIndex++;
            if (index >= totalChunks) return;

            const offset = index * chunkSize;
            const blob = file.slice(offset, Math.min(offset + chunkSize, file.size));

            // Retry, 1s, 2s, 4s, etc
            let lastError: unknown = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                if (signal.aborted) throw new ChunkUploadError("aborted");

                try {
                    await putChunk(uploadId, index, blob, signal, (loaded) => {
                        onChunkProgress(index, loaded);
                    });

                    onChunkComplete(index, blob.size);
                    lastError = null;

                    break;
                } catch (error) {
                    lastError = error;
                    if (signal.aborted) throw error;
                    if (attempt >= maxRetries) break;

                    // Reset the chunk's progress so it is reflected on the UI
                    onChunkProgress(index, 0);
                    await sleep(1000 * Math.pow(2, attempt), signal);
                }
            }

            if (lastError) throw lastError;
        }
    };

    const workerCount = Math.min(concurrency, totalChunks);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
};
