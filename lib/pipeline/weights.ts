// How the final score combines its parts. Shared by the scorer and by the score
// breakdown in the UI, so the explanation can never drift from the arithmetic.
export const WEIGHTS = { overlap: 0.5, mustCoverage: 0.3, seniority: 0.1, location: 0.1 } as const;

export const APPLY_AT = 70;
export const BORDERLINE_AT = 55;
