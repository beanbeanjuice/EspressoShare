import { MAX_TITLE_LENGTH } from "@lib/limits";

export type Cut = {
    track: number; // 1-based
    start: number;
    end: number;
};

export type UploadMeta = {
    title: string;
    description: string;
    range: [number, number];
    selectedTracks: number[];
    cuts: Cut[];
};

export type ValidateMetaResult =
    | { ok: true; meta: UploadMeta }
    | { ok: false; status: number; message: string };

const MAX_CUTS = 512;

// Makes sure that cuts are the correct intervals (no weird negative intervals)
const isValidCut = (raw: unknown): raw is Cut => {
    if (!raw || typeof raw !== "object") return false;

    const c = raw as Record<string, unknown>;

    return (
        Number.isInteger(c.track) && (c.track as number) >= 1 &&
        typeof c.start === "number" && Number.isFinite(c.start) && c.start >= 0 &&
        typeof c.end === "number" && Number.isFinite(c.end) && c.end > (c.start as number)
    );
};

export const validateMeta = (raw: unknown): ValidateMetaResult => {
    if (!raw || typeof raw !== "object") {
        return { ok: false, status: 400, message: "Bad metadata" };
    }

    const { title, description, range, selectedTracks, cuts } = raw as Record<string, unknown>;

    const [start, end] = Array.isArray(range) ? range : [];
    if (
        typeof title !== "string" || !title.trim() ||
        typeof description !== "string" ||
        !Number.isFinite(start) || !Number.isFinite(end) ||
        start < 0 || end <= start ||
        !Array.isArray(selectedTracks) ||
        !selectedTracks.every((number: unknown) => Number.isInteger(number))
    ) {
        return { ok: false, status: 400, message: "Bad metadata" };
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
        return { ok: false, status: 400, message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` };
    }

    // cuts is optional for backwards compat
    let normalizedCuts: Cut[] = [];
    if (cuts !== undefined && cuts !== null) {
        if (!Array.isArray(cuts) || cuts.length > MAX_CUTS || !cuts.every(isValidCut)) {
            return { ok: false, status: 400, message: "Bad cuts" };
        }
        normalizedCuts = cuts as Cut[];
    }

    return {
        ok: true,
        meta: {
            title,
            description,
            range: [start as number, end as number],
            selectedTracks: selectedTracks as number[],
            cuts: normalizedCuts,
        },
    };
};
