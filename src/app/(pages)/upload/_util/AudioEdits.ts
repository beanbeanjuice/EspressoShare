export type Cut = {
    track: number;
    start: number;
    end: number;
};

export const MIN_CUT_SECONDS = 0.05;

let nextCutId = 1;
export const makeCutId = () => `cut-${nextCutId++}`;
