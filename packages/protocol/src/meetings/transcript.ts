/**
 * The one reading format for a stored transcript, shared by the client (live page, recording
 * reader) and the server (`meeting_view`, write-up). The stored form is one line per recognized
 * sentence with millisecond times; people and models read paragraphs instead, so the same rules
 * turn the sentences into paragraphs for every reader:
 *
 * - consecutive sentences from the same speaker start one paragraph when the pause between them
 *   is at most 3 s and the paragraph stays within 240 characters;
 * - a paragraph is prefixed with the time it starts at (`[mm:ss]`, `[h:mm:ss]` past an hour);
 * - a confident speaker is written `说话人 N`, and an uncertain one is written with no name at
 *   all — the placeholder 「归属待确认」 never reaches a reader.
 *
 * Millisecond timing stays in the database: `meetingTranscriptSentences` answers a lookup by words
 * or by time range with the exact start and end of each sentence.
 */

const TIMESTAMP = String.raw`\d{2}:[0-5]\d:[0-5]\d\.\d{3}`;
const SENTENCE = new RegExp(
	String.raw`^(${TIMESTAMP})–(${TIMESTAMP}) (?:归属待确认|第([1-9]\d*)段说话人(\d{1,3}))：(.+)$`,
	"u",
);
const BATCH_HEADER = /^第[1-9]\d*段 · 说话人归属待确认$/u;

/** A longer pause is a new thought, even from the same speaker (the rule the live page already had). */
export const MEETING_PARAGRAPH_GAP_MS = 3000;
/** A paragraph stops growing here so one block stays readable in a chat bubble or a tool result. */
export const MEETING_PARAGRAPH_CHARS = 240;

/** A speaker label is local to one ASR request, so the batch is part of its identity. */
export interface MeetingTranscriptSpeaker {
	batch: string;
	number: string;
}

/** One recognized sentence. `startMs`/`endMs` are null when the line carried no trustworthy time. */
export interface MeetingTranscriptSentence {
	startMs: number | null;
	endMs: number | null;
	speaker: MeetingTranscriptSpeaker | null;
	text: string;
}

/** One paragraph a reader sees, with the sentences that formed it (for per-sentence anchors). */
export interface MeetingTranscriptParagraph {
	startMs: number | null;
	endMs: number | null;
	speaker: MeetingTranscriptSpeaker | null;
	text: string;
	sentences: MeetingTranscriptSentence[];
}

function elapsedMs(value: string) {
	const [hours, minutes, seconds, milliseconds] = value.split(/[:.]/).map(Number) as [number, number, number, number];
	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
}

/**
 * Split stored transcript text into its sentences, in reading order. A batch header is structure,
 * not speech, so it is dropped; a line whose timing cannot be parsed keeps its words with no time,
 * and nothing is redacted from the spoken text.
 */
export function parseMeetingTranscript(transcript: string): MeetingTranscriptSentence[] {
	return transcript.split(/\r?\n/).flatMap((line) => {
		if (!line.trim() || BATCH_HEADER.test(line)) return [];
		const [, start, end, batch, number, text] = SENTENCE.exec(line) ?? [];
		if (!start || !end || !text) return [{ startMs: null, endMs: null, speaker: null, text: line }];
		const startMs = elapsedMs(start);
		const endMs = elapsedMs(end);
		const timed = endMs >= startMs;
		return [
			{
				startMs: timed ? startMs : null,
				endMs: timed ? endMs : null,
				speaker: timed && batch && number ? { batch, number } : null,
				text,
			},
		];
	});
}

function sameSpeaker(a: MeetingTranscriptSpeaker | null, b: MeetingTranscriptSpeaker | null) {
	return a !== null && b !== null && a.batch === b.batch && a.number === b.number;
}

/** Group sentences into the paragraphs every reader shows. Order and timing are never reordered. */
export function meetingTranscriptParagraphs(sentences: MeetingTranscriptSentence[]): MeetingTranscriptParagraph[] {
	const paragraphs: MeetingTranscriptParagraph[] = [];
	for (const sentence of sentences) {
		const previous = paragraphs.at(-1);
		const merges =
			previous !== undefined &&
			previous.startMs !== null &&
			previous.endMs !== null &&
			sentence.startMs !== null &&
			sentence.endMs !== null &&
			sameSpeaker(previous.speaker, sentence.speaker) &&
			previous.endMs <= sentence.startMs &&
			sentence.startMs - previous.endMs <= MEETING_PARAGRAPH_GAP_MS &&
			previous.text.length + sentence.text.length <= MEETING_PARAGRAPH_CHARS;
		if (merges && previous) {
			paragraphs[paragraphs.length - 1] = {
				...previous,
				text: `${previous.text} ${sentence.text}`,
				endMs: sentence.endMs,
				sentences: [...previous.sentences, sentence],
			};
		} else {
			paragraphs.push({ ...sentence, sentences: [sentence] });
		}
	}
	return paragraphs;
}

/** `mm:ss`, or `h:mm:ss` once the recording passes an hour. Minutes are never wrapped at 60. */
export function formatMeetingTime(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = String(total % 60).padStart(2, "0");
	return total >= 3600
		? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`
		: `${String(minutes).padStart(2, "0")}:${seconds}`;
}

/** One paragraph as a reader sees it: `[12:04] 说话人 1：…`, with no speaker when none is known. */
export function formatMeetingParagraph(paragraph: MeetingTranscriptParagraph): string {
	const speaker = paragraph.speaker ? `说话人 ${paragraph.speaker.number}：` : "";
	if (paragraph.startMs === null) return `${speaker}${paragraph.text}`;
	return `[${formatMeetingTime(paragraph.startMs)}] ${speaker}${paragraph.text}`;
}

/** The reading format of a whole stored transcript, one paragraph per line. */
export function formatMeetingTranscript(transcript: string): string {
	return meetingTranscriptParagraphs(parseMeetingTranscript(transcript)).map(formatMeetingParagraph).join("\n");
}

export interface MeetingTranscriptLookup {
	/** Sentences whose words contain this text (case-sensitive substring, trimmed). */
	text?: string;
	/** Milliseconds from the recording start; a sentence is included when it overlaps the range. */
	fromMs?: number;
	toMs?: number;
}

/**
 * The precise sentences behind the reading format, for a lookup by words or by time range. A timed
 * sentence matches a range when the two intervals overlap; an untimed line matches only words,
 * because inventing a time for it would make a citation wrong.
 */
export function meetingTranscriptSentences(
	transcript: string,
	lookup: MeetingTranscriptLookup,
): MeetingTranscriptSentence[] {
	const text = lookup.text?.trim();
	const sentences = parseMeetingTranscript(transcript).filter((sentence) => {
		if (text !== undefined && !sentence.text.includes(text)) return false;
		const from = lookup.fromMs ?? null;
		const to = lookup.toMs ?? null;
		if (from === null && to === null) return true;
		if (sentence.startMs === null || sentence.endMs === null) return false;
		return (to === null || sentence.startMs < to) && (from === null || sentence.endMs >= from);
	});
	return sentences;
}
