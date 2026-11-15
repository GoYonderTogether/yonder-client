// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useVoiceInput } from "./use-voice-input.ts";

const calls = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@yonder/ui-data", () => ({ useApi: () => ({ openVoiceSocket: calls.open }) }));
class Socket {
	static instance: Socket;
	readyState = 1;
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
	message(value: unknown) {
		this.onmessage?.({ data: JSON.stringify(value) });
	}
}
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	calls.open.mockReset();
});
test("finish during permission request resolves immediately and stops a late microphone", async () => {
	vi.stubGlobal("WebSocket", Socket);
	vi.stubGlobal(
		"AudioContext",
		class {
			resume() {
				return Promise.resolve();
			}
			close() {
				return Promise.resolve();
			}
		},
	);
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
	vi.stubGlobal("WebSocket", Socket);
	vi.stubGlobal(
		"AudioContext",
		class {
			resume() {
				return Promise.resolve();
			}
			close() {
				return Promise.resolve();
			}
		},
	);
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] }) },
	});
	calls.open.mockImplementation(() => new Socket());
	vi.stubGlobal("crypto", { randomUUID: () => "session" });
	const receive = vi.fn();
	const hook = renderHook(() => useVoiceInput("chat"));
	await act(async () => {
		await hook.result.current.start(receive);
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "hello" });
		hook.result.current.cancel();
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "late" });
	});
	expect(receive).toHaveBeenCalledExactlyOnceWith("hello");
});

test("final sentence does not regress when an older partial arrives", async () => {
	vi.stubGlobal("WebSocket", Socket);
	vi.stubGlobal(
		"AudioContext",
		class {
			resume() {
				return Promise.resolve();
			}
			close() {
				return Promise.resolve();
			}
		},
	);
	vi.stubGlobal("crypto", { randomUUID: () => "session" });
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getAudioTracks: () => [] }) },
	});
	calls.open.mockImplementation(() => new Socket());
	const receive = vi.fn();
	const hook = renderHook(() => useVoiceInput("chat"));
	await act(async () => {
		await hook.result.current.start(receive);
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "final", final: true });
		Socket.instance.message({ type: "transcript", sessionId: "session", sentenceId: 1, text: "old", final: false });
	});
	expect(receive).toHaveBeenCalledExactlyOnceWith("final");
	hook.unmount();
});
