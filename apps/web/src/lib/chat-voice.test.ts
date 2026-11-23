import { expect, test } from "vitest";
import { voiceDuration, voiceFiles } from "./chat-voice.ts";

test("uploads independent PCM16 WAV files without losing samples at checkpoint or upload boundaries", async () => {
	const input = Uint8Array.from({ length: 80 }, (_, index) => index);
	const recording = { nonce: "voice-nonce", parts: [new Blob([input.slice(0, 48)]), new Blob([input.slice(48)])] };
	const files = voiceFiles(recording, 1);
	expect(voiceDuration(recording)).toBe(3);
	expect(files).toHaveLength(3);
	const bytes = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
	expect(bytes.map((part) => new DataView(part.buffer).getUint32(40, true))).toEqual([32, 32, 16]);
	expect(bytes.flatMap((part) => [...part.slice(44)])).toEqual([...input]);
});
