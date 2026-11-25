import type { MeetingProgress } from "./meetings.ts";

/**
 * Transcription coverage as the owner, the Bot and every view of a recording read it: the recording
 * card, `meeting_view`, the `recordings` list and the items page. The percent is recognized batch
 * duration over the recording's own duration, so a recording whose last batch is still running does
 * not look nearly finished; when a recording has no audio duration (a photo-only note) the batch
 * count is the honest measure instead.
 *
 * It lives beside the type it returns rather than in one server package, because more than one
 * reader computes it and two copies of the formula would eventually disagree.
 */
export function meetingProgress(input: {
	totalBatches: number;
	completedBatches: number;
	completedMs: number;
	durationMs: number;
}): MeetingProgress {
	const { totalBatches, completedBatches, completedMs, durationMs } = input;
	const percent =
		durationMs > 0
			? Math.round((completedMs / durationMs) * 100)
			: totalBatches > 0
				? Math.round((completedBatches / totalBatches) * 100)
				: 0;
	return {
		completedBatches,
		totalBatches,
		percent: Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0)),
	};
}
