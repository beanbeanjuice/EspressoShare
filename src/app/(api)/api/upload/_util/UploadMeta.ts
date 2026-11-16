import { MAX_TITLE_LENGTH } from "@lib/limits";

export type UploadMeta = {
    title: string;
    description: string;
    range: [number, number];
    selectedTracks: number[];
};

export type ValidateMetaResult =
    | { ok: true; meta: UploadMeta }
    | { ok: false; status: number; message: string };

export const validateMeta = (raw: unknown): ValidateMetaResult => {
    if (!raw || typeof raw !== "object") {
        return { ok: false, status: 400, message: "Bad metadata" };
    }

    const { title, description, range, selectedTracks } = raw as Record<string, unknown>;

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

    return {
        ok: true,
        meta: {
            title,
            description,
            range: [start as number, end as number],
            selectedTracks: selectedTracks as number[],
        },
    };
};
