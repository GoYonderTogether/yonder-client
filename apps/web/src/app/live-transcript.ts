import type { MeetingPhoto } from "../lib/meeting-photos.ts";

type TurnTiming = { startMs: number; endMs: number; speaker?: { batch: string; number: string } };
type LiveTranscriptEntry = { kind: "speech"; index: number; text: string; timing?: TurnTiming };
type TimelineEntry = (LiveTranscriptEntry & { turns?: LiveTranscriptEntry[] }) | { kind: "photo"; photo: MeetingPhoto };

const timestamp = String.raw`\d{2}:[0-5]\d:[0-5]\d\.\d{3}`;
const speakerTurn = new RegExp(`^(${timestamp})–(${timestamp}) (?:归属待确认|第([1-9]\\d*)段说话人(\\d{1,3}))：(.+)$`);
const batchHeader = /^第[1-9]\d*段 · 说话人归属待确认$/;

function elapsedMs(value: string) {
	const [hours, minutes, seconds, milliseconds] = value.split(/[:.]/).map(Number) as [number, number, number, number];
	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
}

/** Decode only the live ASR wire envelope, never redact words from the spoken text. */
export function liveTranscriptEntries(transcript: string): LiveTranscriptEntry[] {
	return transcript.split(/\r?\n/).flatMap((line, index) => {
		if (!line.trim() || batchHeader.test(line)) return [];
		const [, start, end, batch, number, text] = speakerTurn.exec(line) ?? [];
		if (!start || !end || !text) return [{ kind: "speech", index, text: line }];
		const startMs = elapsedMs(start);
		const endMs = elapsedMs(end);
		const timing =
			endMs >= startMs ? { startMs, endMs, ...(batch && number ? { speaker: { batch, number } } : {}) } : undefined;
		return [{ kind: "speech", index, text, ...(timing ? { timing } : {}) }];
	});
}

export function liveRecordingTimeline(transcript: LiveTranscriptEntry[], photos: MeetingPhoto[]): TimelineEntry[] {
	const shots = [...photos].sort((a, b) => a.elapsedMs - b.elapsedMs);
	const timeline: TimelineEntry[] = [];
	let offset = 0;
	for (const entry of transcript) {
		const { timing } = entry;
		let photo = shots[offset];
		// Place photos at the next known speech boundary, never splitting a turn or dating an untimed paragraph.
		while (timing && photo && photo.elapsedMs <= timing.startMs) {
			timeline.push({ kind: "photo", photo });
			photo = shots[++offset];
		}
		const previous = timeline.at(-1);
		if (
			timing?.speaker &&
			previous?.kind === "speech" &&
			previous.timing?.speaker?.batch === timing.speaker.batch &&
			previous.timing.speaker.number === timing.speaker.number &&
			previous.timing.endMs <= timing.startMs &&
			timing.startMs - previous.timing.endMs <= 3000 &&
			previous.text.length + entry.text.length <= 240
		) {
			timeline[timeline.length - 1] = {
				...previous,
				text: `${previous.text} ${entry.text}`,
				turns: [...(previous.turns ?? [previous]), entry],
				timing: { ...previous.timing, endMs: timing.endMs },
			};
		} else {
			timeline.push(entry);
		}
	}
	for (const photo of shots.slice(offset)) timeline.push({ kind: "photo", photo });
	return timeline;
}
