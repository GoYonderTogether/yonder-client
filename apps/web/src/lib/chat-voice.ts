import { MEETING_RATE, pcm16WavHeader } from "./browser-meeting-wav.ts";

export type ChatVoice = { nonce: string; parts: Blob[]; frozen?: true };

const bytesPerMs = (MEETING_RATE * 2) / 1000;
export const VOICE_CHECKPOINT_BYTES = 30_000 * bytesPerMs;
export const VOICE_MAX_BYTES = 600_000 * bytesPerMs;
export const VOICE_MIN_BYTES = 150 * bytesPerMs;
export const voiceBytes = (recording: ChatVoice) => recording.parts.reduce((total, part) => total + part.size, 0);
export const voiceDuration = (recording: ChatVoice) => Math.ceil(voiceBytes(recording) / bytesPerMs);

export function voiceFiles(recording: ChatVoice, maxMs: number): File[] {
	const audio = new Blob(recording.parts);
	const partBytes = maxMs * bytesPerMs;
	const parts: File[] = [];
	for (let start = 0; start < audio.size; start += partBytes) {
		const pcm = audio.slice(start, start + partBytes);
		parts.push(new File([pcm16WavHeader(pcm.size), pcm], "voice.wav", { type: "audio/wav" }));
	}
	return parts;
}
