import {RefObject, useCallback, useEffect, useRef} from "react";

import type {DecodedAudioTrack} from "@/app/(pages)/upload/_util/DecodeAudioTracks";
import type {Cut} from "@/app/(pages)/upload/_util/AudioEdits";

type UseAudioPreviewOptions = {
    videoRef: RefObject<HTMLVideoElement | null>;
    src: string | null;
    decodedTracks: Map<number, DecodedAudioTrack>;
    mutedTracks: Set<number>;
    soloedTracks: Set<number>;
    cuts: Cut[];
};

type TrackState = {
    gain: GainNode;
    source: AudioBufferSourceNode | null;
};

const baseGainFor = (trackNumber: number, muted: Set<number>, soloed: Set<number>) => {
    if (soloed.size > 0) return soloed.has(trackNumber) && !muted.has(trackNumber) ? 1 : 0;
    return muted.has(trackNumber) ? 0 : 1;
};

const buildRegionsFromCuts = (cuts: Cut[], trackNumber: number, videoStart: number, maxLength: number) => {
    const rough: {s: number; e: number}[] = [];
    for (const c of cuts) {
        if (c.track !== trackNumber) continue;
        const s = Math.max(0, c.start - videoStart);
        const e = c.end - videoStart;
        if (e > s && s < maxLength) rough.push({s, e: Math.min(e, maxLength)});
    }
    rough.sort((a, b) => a.s - b.s);
    const merged: {s: number; e: number}[] = [];
    for (const r of rough) {
        const last = merged[merged.length - 1];
        if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
        else merged.push({s: r.s, e: r.e});
    }
    return merged;
};

const useAudioPreview = ({videoRef, src, decodedTracks, mutedTracks, soloedTracks, cuts}: UseAudioPreviewOptions) => {
    const ctxRef = useRef<AudioContext | null>(null);
    const statesRef = useRef<Map<number, TrackState>>(new Map());
    const playGenRef = useRef(0);
    const wantPlayRef = useRef(false);

    const snapshotRef = useRef({decodedTracks, mutedTracks, soloedTracks, cuts});

    useEffect(() => {
        snapshotRef.current = {decodedTracks, mutedTracks, soloedTracks, cuts};
    }, [decodedTracks, mutedTracks, soloedTracks, cuts]);

    const ensureContext = useCallback(() => {
        if (typeof window === "undefined") return null;
        if (!ctxRef.current) {
            try { ctxRef.current = new AudioContext(); } catch { return null; }
        }
        return ctxRef.current;
    }, []);

    const stopAllSources = useCallback(() => {
        for (const state of statesRef.current.values()) {
            const s = state.source;
            state.source = null;
            if (s) {
                try { s.stop(); } catch { /* already stopped */ }
                try { s.disconnect(); } catch { /* fine */ }
            }
        }
    }, []);

    // Increase gain but don't rebuild gain each time we make a change
    const syncGraph = useCallback(() => {
        const ctx = ensureContext();
        if (!ctx) return;

        const {decodedTracks: td} = snapshotRef.current;

        for (const [n, state] of statesRef.current) {
            if (!td.has(n)) {
                if (state.source) { try { state.source.stop(); } catch { /* fine */ } }
                try { state.gain.disconnect(); } catch { /* fine */ }
                statesRef.current.delete(n);
            }
        }

        for (const n of td.keys()) {
            if (!statesRef.current.has(n)) {
                const gain = ctx.createGain();
                gain.gain.value = 0;
                gain.connect(ctx.destination);
                statesRef.current.set(n, {gain, source: null});
            }
        }
    }, [ensureContext]);

    const spawnSource = useCallback((number: number, decoded: DecodedAudioTrack, videoTime: number) => {
        const ctx = ctxRef.current;
        if (!ctx) return;
        const state = statesRef.current.get(number);
        if (!state) return;
        const {mutedTracks: mt, soloedTracks: st, cuts: cs} = snapshotRef.current;
        const now = ctx.currentTime;

        const base = baseGainFor(number, mt, st);
        const regions = buildRegionsFromCuts(cs, number, videoTime, Math.max(0, decoded.buffer.duration - videoTime));

        const startInRegion = regions.length > 0 && regions[0].s <= 0 && regions[0].e > 0;
        state.gain.gain.cancelScheduledValues(now);
        state.gain.gain.setValueAtTime(startInRegion ? 0 : base, now);
        for (const r of regions) {
            if (r.s > 0) state.gain.gain.setValueAtTime(0, now + r.s);
            state.gain.gain.setValueAtTime(base, now + r.e);
        }

        if (videoTime >= decoded.buffer.duration) return;

        const source = ctx.createBufferSource();
        source.buffer = decoded.buffer;
        source.connect(state.gain);
        try {
            source.start(now, Math.max(0, videoTime));
            state.source = source;
        } catch { /* catch something here? */ }
    }, []);

    const startAll = useCallback(async (videoTime: number) => {
        const gen = ++playGenRef.current;
        const ctx = ensureContext();

        if (!ctx) return;
        if (ctx.state === "suspended") {
            try { await ctx.resume(); } catch { return; }
        }
        if (gen !== playGenRef.current || !wantPlayRef.current) return;

        syncGraph();
        stopAllSources();

        const {decodedTracks: td} = snapshotRef.current;
        for (const [n, decoded] of td) spawnSource(n, decoded, videoTime);
    }, [ensureContext, syncGraph, stopAllSources, spawnSource]);

    const startMissing = useCallback((videoTime: number) => {
        if (!wantPlayRef.current) return;

        const ctx = ensureContext();
        if (!ctx || ctx.state === "suspended") return;

        syncGraph();
        const {decodedTracks: td} = snapshotRef.current;
        for (const [n, decoded] of td) {
            const state = statesRef.current.get(n);
            if (!state || state.source) continue;
            spawnSource(n, decoded, videoTime);
        }
    }, [ensureContext, syncGraph, spawnSource]);

    const applyStaticGain = useCallback(() => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        const {mutedTracks: mt, soloedTracks: st} = snapshotRef.current;
        const now = ctx.currentTime;
        for (const [number, state] of statesRef.current) {
            const base = baseGainFor(number, mt, st);
            state.gain.gain.cancelScheduledValues(now);
            state.gain.gain.setValueAtTime(base, now);
        }
    }, []);

    useEffect(() => {
        const v = videoRef.current;
        if (!v || !src) return;

        const playGen = playGenRef;
        const wantPlay = wantPlayRef;

        const onPlay = () => {
            wantPlay.current = true;
            void startAll(v.currentTime);
        };

        const onPause = () => {
            wantPlay.current = false;
            playGen.current++;
            stopAllSources();
        };

        const onSeeked = () => {
            if (v.paused) return;
            void startAll(v.currentTime);
        };

        v.addEventListener("play", onPlay);
        v.addEventListener("pause", onPause);
        v.addEventListener("seeked", onSeeked);
        return () => {
            wantPlay.current = false;
            playGen.current++;
            v.removeEventListener("play", onPlay);
            v.removeEventListener("pause", onPause);
            v.removeEventListener("seeked", onSeeked);
            stopAllSources();
        };
    }, [videoRef, src, startAll, stopAllSources]);

    useEffect(() => {
        syncGraph();
        const v = videoRef.current;
        if (v && !v.paused && wantPlayRef.current) startMissing(v.currentTime);
    }, [decodedTracks, syncGraph, startMissing, videoRef]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) applyStaticGain();
        else void startAll(v.currentTime);
    }, [mutedTracks, soloedTracks, cuts, applyStaticGain, startAll, videoRef]);

    useEffect(() => {
        const states = statesRef;
        const ctxHolder = ctxRef;
        const playGen = playGenRef;
        const wantPlay = wantPlayRef;
        return () => {
            playGen.current++;
            wantPlay.current = false;
            stopAllSources();
            for (const state of states.current.values()) {
                try { state.gain.disconnect(); } catch { /* fine */ }
            }
            states.current.clear();
            const ctx = ctxHolder.current;
            ctxHolder.current = null;
            if (ctx) { void ctx.close().catch(() => {}); }
        };
    }, [stopAllSources]);
};

export default useAudioPreview;
