export const MEETING_RATE = 16000;
export const MEETING_PART_MS = 4000;

export function meetingWav(input: AudioBuffer, start: number, frames: number): Uint8Array<ArrayBuffer> {
	const wav = new Uint8Array(44 + frames * 2);
	const view = new DataView(wav.buffer);
	wav.set(new TextEncoder().encode("RIFF"), 0);
	wav.set(new TextEncoder().encode("WAVEfmt "), 8);
	wav.set(new TextEncoder().encode("data"), 36);
	view.setUint32(4, wav.length - 8, true);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, MEETING_RATE, true);
	view.setUint32(28, MEETING_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	view.setUint32(40, frames * 2, true);
	const channels = Array.from({ length: input.numberOfChannels }, (_, i) => input.getChannelData(i));
	for (let i = 0; i < frames; i++) {
		let sample = 0;
		for (const channel of channels) sample += channel[start + i] ?? 0;
		view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample / channels.length)) * 32767, true);
	}
	return wav;
}
