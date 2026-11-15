import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@prisma";
import { UPLOADS_DIR } from "@api/upload/Jobs";
import type { UploadMeta } from "@api/upload/_util/UploadMeta";

// 32 MiB per chunk. The server decides this; the client just does what it's told.
export const CHUNK_SIZE = 32 * 1024 * 1024;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadSession = {
    uploadId: string;
    userId: string;
    rawPath: string;
    size: number;
    chunkSize: number;
    totalChunks: number;
    received: Set<number>;
    meta: UploadMeta;
    fileName?: string;
    completing: boolean;
    createdAt: number;
    lastActivity: number;
};

//////////////////
// GLOBAL STATE //
//////////////////

// Same HMR-safe pattern as Jobs.ts — pin the registry on globalThis so dev-reloads
// don't drop in-flight uploads.

const g = globalThis as unknown as {
    __uploadSessions?: {
        sessions: Map<string, UploadSession>;
        sweptOrphans: boolean;
    };
};

const state = g.__uploadSessions ?? {
    sessions: new Map<string, UploadSession>(),
    sweptOrphans: false,
};
g.__uploadSessions = state;

//////////////////////
// END GLOBAL STATE //
//////////////////////

export const getUploadSession = (id: string) => state.sessions.get(id);

export const setUploadSession = (session: UploadSession) => {
    state.sessions.set(session.uploadId, session);
};

export const deleteUploadSession = (id: string) => {
    state.sessions.delete(id);
};

// Drop sessions whose lastActivity is older than TTL, removing the raw file too.
// A completing session is never pruned — the finalizer owns it.
export const pruneStaleSessions = async () => {
    try {
        const cutoff = Date.now() - SESSION_TTL_MS;
        const stale: UploadSession[] = [];
        for (const s of state.sessions.values()) {
            if (!s.completing && s.lastActivity < cutoff) stale.push(s);
        }
        for (const s of stale) {
            state.sessions.delete(s.uploadId);
            await rm(s.rawPath, { force: true }).catch(() => {});
        }
    } catch (error) {
        console.error("Upload session prune failed:", error);
    }
};

// One-shot sweep: delete orphan `*.upload` files in UPLOADS_DIR that
// (a) aren't referenced by any live TranscodeJob.rawPath, and
// (b) are older than the TTL.
// Never touches a file a TranscodeJob still points at.
export const sweepOrphanUploads = async () => {
    if (state.sweptOrphans) return;
    state.sweptOrphans = true;

    try {
        const entries = await readdir(UPLOADS_DIR).catch(() => [] as string[]);
        const uploads = entries.filter((name) => name.endsWith(".upload"));
        if (uploads.length === 0) return;

        const jobs = await prisma.transcodeJob.findMany({ select: { rawPath: true } });
        const referenced = new Set(jobs.map((j) => j.rawPath));

        const cutoff = Date.now() - SESSION_TTL_MS;
        for (const name of uploads) {
            const p = path.join(UPLOADS_DIR, name);
            if (referenced.has(p)) continue;
            const info = await stat(p).catch(() => null);
            if (!info) continue;
            if (info.mtimeMs > cutoff) continue;
            await rm(p, { force: true }).catch(() => {});
        }
    } catch (error) {
        console.error("Upload orphan sweep failed:", error);
        // leave sweptOrphans true — we'll retry on next server boot
    }
};
