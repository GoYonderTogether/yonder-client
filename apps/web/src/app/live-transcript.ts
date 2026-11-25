import { meetingTranscriptParagraphs, parseMeetingTranscript } from "@yonder/protocol";
import type { MeetingPhoto } from "../lib/meeting-photos.ts";

type TurnTiming = { startMs: number; endMs: number; speaker?: { batch: string; number: string } };
type LiveTranscriptEntry = { kind: "speech"; index: number; text: string; timing?: TurnTiming };
type TimelineEntry = (LiveTranscriptEntry & { turns?: LiveTranscriptEntry[] }) | { kind: "photo"; photo: MeetingPhoto };

/**
 * The live page shows the shared reading format (`@yonder/protocol`): sentences are split by
 * `parseMeetingTranscript`, and the paragraph rule lives there too, so the Bot's `meeting_view`
 * reads the same paragraphs. The rule used to be defined here; it is not duplicated again. A
 * sentence with no trustworthy time is still shown, with no time attached.
 */
export function liveTranscriptEntries(transcript: string): LiveTranscriptEntry[] {
	return parseMeetingTranscript(transcript).map((sentence, index) => {
		const timed = sentence.startMs !== null && sentence.endMs !== null;
		return {
			kind: "speech" as const,
			index,
			text: sentence.text,
			...(timed
				? {
						timing: {
							startMs: sentence.startMs as number,
							endMs: sentence.endMs as number,
							...(sentence.speaker ? { speaker: sentence.speaker } : {}),
						},
					}
				: {}),
		};
	});
}

/** Whether the shared rule puts these two sentences in one paragraph. */
function mergesIntoOneParagraph(previous: LiveTranscriptEntry, entry: LiveTranscriptEntry) {
	if (!previous.timing || !entry.timing) return false;
	const sentence = (item: LiveTranscriptEntry) => ({
		startMs: item.timing?.startMs ?? null,
		endMs: item.timing?.endMs ?? null,
		speaker: item.timing?.speaker ?? null,
		text: item.text,
	});
	return meetingTranscriptParagraphs([sentence(previous), sentence(entry)]).length === 1;
}

/**
 * Place photos at the next known speech boundary, never splitting a turn or dating an untimed
 * paragraph: a photo due before a sentence also breaks the paragraph there, because the previous
 * speech and this one are no longer adjacent on screen.
 */
export function liveRecordingTimeline(transcript: LiveTranscriptEntry[], photos: MeetingPhoto[]): TimelineEntry[] {
	const shots = [...photos].sort((a, b) => a.elapsedMs - b.elapsedMs);
	const timeline: TimelineEntry[] = [];
	let offset = 0;
	let previous: TimelineEntry | undefined;
	for (const entry of transcript) {
		const { timing } = entry;
		let flushed = false;
		while (timing && shots[offset] && (shots[offset] as MeetingPhoto).elapsedMs <= timing.startMs) {
			timeline.push({ kind: "photo", photo: shots[offset++] as MeetingPhoto });
			flushed = true;
		}
		if (flushed) previous = undefined;
		if (previous?.kind === "speech" && mergesIntoOneParagraph(previous, entry) && previous.timing && timing) {
			const merged: TimelineEntry = {
				...previous,
				text: `${previous.text} ${entry.text}`,
				turns: [...(previous.turns ?? [previous]), entry],
				timing: { ...previous.timing, endMs: timing.endMs },
			};
			timeline[timeline.length - 1] = merged;
			previous = merged;
			continue;
		}
		timeline.push(entry);
		previous = entry;
	}
	for (const photo of shots.slice(offset)) timeline.push({ kind: "photo", photo });
	return timeline;
}
