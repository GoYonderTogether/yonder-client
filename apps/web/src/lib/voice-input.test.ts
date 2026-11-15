import { expect, test } from "vitest";
import { voiceWorklet } from "./voice-input.ts";

test("worklet resamples 48 kHz to 16 kHz PCM frames", () => {
	let Processor!: new () => { process(input: Float32Array[][]): void; port: { onmessage: () => void } };
	class Base {
		port = { postMessage: (buffer: ArrayBuffer | string) => frames.push(buffer), onmessage: null };
	}
	const frames: (ArrayBuffer | string)[] = [];
	new Function("AudioWorkletProcessor", "sampleRate", "registerProcessor", voiceWorklet)(
		Base,
		48000,
		(_: string, cls: unknown) => {
			Processor = cls as typeof Processor;
		},
	);
	const processor = new Processor();
	processor.process([[new Float32Array(4800).fill(0.5)]]);
	expect(frames).toHaveLength(1);
	const frame = frames[0];
	if (!(frame instanceof ArrayBuffer)) throw new Error("missing PCM frame");
	expect(new Int16Array(frame).length).toBe(1600);
	expect(new Int16Array(frame)[0]).toBe(16384);
	processor.process([[new Float32Array(300).fill(0.5)]]);
	processor.port.onmessage();
	processor.process([[new Float32Array(4800).fill(0.5)]]);
	processor.port.onmessage();
	expect(frames).toHaveLength(3);
	expect(frames[2]).toBe("flushed");
});
