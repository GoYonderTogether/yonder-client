type LiveTranscriptEntry = { index: number; time?: string; text: string };

const timestamp = String.raw`\d{2}:[0-5]\d:[0-5]\d\.\d{3}`;
const speakerTurn = new RegExp(`^(${timestamp}–${timestamp}) (?:归属待确认|第[1-9]\\d*段说话人\\d{1,3})：(.+)$`);
const batchHeader = /^第[1-9]\d*段 · 说话人归属待确认$/;

/** Decode only the live ASR wire envelope, never redact words from the spoken text. */
export function liveTranscriptEntries(transcript: string): LiveTranscriptEntry[] {
	return transcript.split(/\r?\n/).flatMap((line, index) => {
		if (!line.trim() || batchHeader.test(line)) return [];
		const turn = speakerTurn.exec(line);
		const time = turn?.[1];
		const text = turn?.[2];
		return time && text ? [{ index, time, text }] : [{ index, text: line }];
	});
}
