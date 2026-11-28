/**
 * Face matching against reference photos (README 2026-11-28, 05 人像确认). The types a tool or a route
 * hands a client. These are shapes only: no image is ever here, and a verdict is a suggestion until
 * the owner confirms it on a card.
 */

/** The three verdicts a face-match provider gives. `unsure` is a real answer, not a fallback. */
export type FaceMatchVerdict = "yes" | "no" | "unsure";

/** What the owner did with one suggestion. */
export type FaceMatchOwnerResult = "confirmed" | "rejected" | "unsure";

/**
 * One comparison's result, as `face_match(photo, entityIds)` returns it. `score` is present only for a
 * provider that gives a number (an embedding model); the current `mllm_pairwise` answers with a word.
 */
export interface FaceMatchResult {
	entityId: string;
	verdict: FaceMatchVerdict;
	score?: number;
	/** The model's one-line reason, or the provider's own note (which reference photo it used). */
	basis: string;
}
