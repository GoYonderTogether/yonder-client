// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useVoiceInput } from "./use-voice-input.ts";

const calls = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@yonder/ui-data", () => ({ useApi: () => ({ openVoiceSocket: calls.open }) }));
class Socket {
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static instance: Socket;
	readyState = 0;
	bufferedAmount = 0;
	onopen?: () => void;
	onmessage?: (event: { data: string }) => void;
	onclose?: () => void;
	onerror?: () => void;
	send = vi.fn();
	close = vi.fn();
	constructor() {
		Socket.instance = this;
	}
	ready() {
		this.readyState = Socket.OPEN;
		this.onopen?.();
		this.message({ type: "ready", sessionId: "session" });
	}
	message(value: unknown) {
		this.onmessage?.({ data: JSON.stringify(value) });
	}
}
beforeEach(() => {
	vi.stubGlobal("WebSocket", Socket);
	vi.stubGlobal("crypto", { randomUUID: () => "session" });
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = vi.fn(() => "blob:test");
			static revokeObjectURL = vi.fn();
		},
	);
	vi.stubGlobal(
		"AudioWorkletNode",
		class {
			port = {};
			connect = vi.fn();
			disconnect = vi.fn();
		},
	);
	vi.stubGlobal(
		"AudioContext",
		class {
			audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
			createMediaStreamSource = vi.fn(() => ({ connect: (node: unknown) => node }));
			resume() {
				return Promise.resolve();
			}
			close() {
				return Promise.resolve();
			}
		},
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	calls.open.mockReset();
});
test("finish during permission request resolves immediately and stops a late microphone", async () => {
	let grant!: (stream: unknown) => void;
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: {
			getUserMedia: () =>
				new Promise((r) => {
					grant = r;
				}),
		},
	});
	const stop = vi.fn();
	const hook = renderHook(() => useVoiceInput("chat"));
	act(() => {
		void hook.result.current.start(vi.fn());
	});
	expect(calls.open).not.toHaveBeenCalled();
	await act(async () => {
		await hook.result.current.finish();
	});
	await act(async () => {
		grant({ getTracks: () => [{ stop }] });
		await Promise.resolve();
	});
	expect(stop).toHaveBeenCalledOnce();
	expect(calls.open).not.toHaveBeenCalled();
	expect(hook.result.current.isListening).toBe(false);
});
test("cancel synchronously blocks late transcripts", async () => {
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] }) },
	});
	calls.open.mockImplementation(() => new Socket());
	const receive = vi.fn();
	const hook = renderHook(() => useVoiceInput("chat"));
	await act(async () => {
		await hook.result.current.start(receive);
		Socket.instance.ready();
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "hello" });
		const pending = Socket.instance.onmessage;
		hook.result.current.cancel();
		pending?.({ data: JSON.stringify({ type: "transcript", sessionId: "session", sentenceId: 1, text: "late" }) });
	});
	expect(receive).toHaveBeenCalledExactlyOnceWith("hello");
});

test("final sentence does not regress when an older partial arrives", async () => {
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] }) },
	});
	calls.open.mockImplementation(() => new Socket());
	const receive = vi.fn();
	const hook = renderHook(() => useVoiceInput("chat"));
	await act(async () => {
		await hook.result.current.start(receive);
		Socket.instance.ready();
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "final", final: true });
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "old", final: false });
	});
	expect(receive).toHaveBeenCalledExactlyOnceWith("final");
	hook.unmount();
});
