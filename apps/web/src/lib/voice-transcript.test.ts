import { afterEach, expect, test, vi } from "vitest";
import { startVoiceTranscript } from "./voice-transcript.ts";

class TestSocket {
	readyState: number = WebSocket.CONNECTING;
	bufferedAmount = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	send = vi.fn<(data: string | ArrayBuffer) => void>();
	close = vi.fn();

	open() {
		this.readyState = WebSocket.OPEN;
		this.onopen?.();
	}

	receive(value: object) {
		this.onmessage?.({ data: JSON.stringify(value) });
	}
}

afterEach(() => vi.useRealTimers());

test("a single socket sends the opening audio, revises partial sentences, and stops on release", () => {
	const socket = new TestSocket();
	const onText = vi.fn();
	const preview = startVoiceTranscript(() => socket as unknown as WebSocket, onText);
	const first = new ArrayBuffer(3200);
	const second = new ArrayBuffer(3200);
	preview.frame(first);
	socket.open();
	const request = socket.send.mock.calls[0]?.[0];
	if (typeof request !== "string") throw new Error("The preview did not start a session");
	const start = JSON.parse(request);
	expect(start).toMatchObject({ type: "start", format: "pcm", sampleRate: 16_000 });
	preview.frame(second);
	expect(socket.send.mock.calls).toEqual([[request]]);
	socket.receive({ type: "ready", sessionId: "other" });
	expect(socket.send.mock.calls).toEqual([[request]]);
	socket.receive({ type: "ready", sessionId: start.sessionId });
	expect(socket.send.mock.calls).toEqual([[request], [first], [second]]);
	const transcript = { type: "transcript", sessionId: start.sessionId };
	socket.receive({ ...transcript, sentenceId: 2, text: "世界" });
	socket.receive({ ...transcript, sentenceId: 1, text: "你" });
	socket.receive({ ...transcript, sentenceId: 1, text: "你好，", final: true });
	socket.receive({ ...transcript, sentenceId: 1, text: "你" });
	expect(onText.mock.calls).toEqual([["世界"], ["你世界"], ["你好，世界"]]);
	const queuedMessage = socket.onmessage;
	preview.stop();
	preview.stop();
	queuedMessage?.({ data: JSON.stringify({ ...transcript, sentenceId: 3, text: "迟到" }) });
	preview.frame(second);
	expect(socket.close).toHaveBeenCalledOnce();
	expect(socket.send).toHaveBeenCalledTimes(3);
	expect(onText).toHaveBeenCalledTimes(3);
});

test("an unavailable preview abandons its audio buffer without surfacing a recording error", () => {
	vi.useFakeTimers();
	const socket = new TestSocket();
	const onText = vi.fn();
	const preview = startVoiceTranscript(() => socket as unknown as WebSocket, onText);
	const first = new ArrayBuffer(3200);
	preview.frame(first);
	vi.advanceTimersByTime(5000);
	expect(socket.close).toHaveBeenCalledOnce();
	socket.open();
	preview.frame(first);
	expect(socket.send).not.toHaveBeenCalled();
	expect(onText).not.toHaveBeenCalled();
	const unavailable = startVoiceTranscript(() => {
		throw new Error("Missing token");
	}, onText);
	expect(() => unavailable.frame(first)).not.toThrow();
});
