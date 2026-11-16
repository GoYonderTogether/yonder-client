// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { MeetingRecorderState } from "@yonder/feature-meetings";
import { afterEach, expect, test, vi } from "vitest";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";

const { invoke, supported } = vi.hoisted(() => ({ invoke: vi.fn(), supported: { value: true } }));
vi.mock("../lib/meeting-recorder.ts", async (original) => ({
	...(await original<object>()),
	invokeMeetingRecorder: invoke,
	meetingRecorderSupported: () => supported.value,
}));
afterEach(() => {
	vi.clearAllMocks();
	supported.value = true;
});

const saved: MeetingRecorderState = {
	supported: true,
	activeId: null,
	recordings: [
		{
			id: "saved",
			ownerId: "person",
			title: "Meeting",
			state: "interrupted",
			startedAt: 1,
			endedAt: 2,
			durationMs: 4000,
			savedDurationMs: 4000,
			sampleRate: 16000,
			channels: 1,
			segments: [{ index: 0, durationMs: 4000, byteLength: 128044 }],
			error: null,
		},
	],
};

test("recovering native state never starts capture, and closing the view never stops it", async () => {
	invoke.mockResolvedValue(saved);
	const { result, unmount } = renderHook(() => useMeetingRecorder("person"));
	await waitFor(() => expect(result.current.state.recordings[0]?.state).toBe("interrupted"));
	expect(invoke).toHaveBeenCalledWith("set_owner", { ownerId: "person" });
	unmount();
	expect(invoke.mock.calls.map(([command]) => command)).toEqual(["set_owner"]);
});

test("a shell without the recorder plugin answers nothing and the frame keeps rendering", async () => {
	invoke.mockResolvedValue(null);
	const { result } = renderHook(() => useMeetingRecorder("person"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(result.current.state).toEqual({ supported: false, activeId: null, recordings: [] });
});

test("the start button calls the independent native recorder, not speech transcription", async () => {
	invoke.mockResolvedValue(saved);
	const { result } = renderHook(() => useMeetingRecorder("person"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	await act(async () => result.current.start("Planning"));
	expect(invoke).toHaveBeenLastCalledWith("start", { ownerId: "person", title: "Planning" });
});

test("old owner responses cannot populate the next owner's recordings", async () => {
	let finish: (state: MeetingRecorderState) => void = () => {};
	invoke
		.mockImplementationOnce(
			() =>
				new Promise<MeetingRecorderState>((resolve) => {
					finish = resolve;
				}),
		)
		.mockResolvedValue({ supported: true, activeId: null, recordings: [] });
	const { result, rerender } = renderHook(({ owner }) => useMeetingRecorder(owner), {
		initialProps: { owner: "person" },
	});
	rerender({ owner: "other" });
	await waitFor(() => expect(result.current.ready).toBe(true));
	await act(async () => finish(saved));
	expect(result.current.state.recordings).toEqual([]);
	expect(invoke).toHaveBeenLastCalledWith("set_owner", { ownerId: "other" });
});

test("browser fallback does not request microphone or invoke a native command", async () => {
	supported.value = false;
	const { result } = renderHook(() => useMeetingRecorder("person"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	await act(async () => result.current.start("Meeting"));
	expect(result.current.state.supported).toBe(false);
	expect(invoke).not.toHaveBeenCalled();
});

test("mobile permission and notification errors become actionable messages without raw paths", async () => {
	invoke.mockResolvedValue(saved);
	const { result } = renderHook(() => useMeetingRecorder("person"));
	await waitFor(() => expect(result.current.ready).toBe(true));
	for (const [native, expected] of [
		["microphone_denied", "permission_denied"],
		["microphone_unavailable", "audio_unavailable"],
		["wrong_owner", "owner_mismatch"],
		["meeting_recorder_wrongOwner", "owner_mismatch"],
		["notifications_denied", "notifications_required"],
		["notifications_disabled", "notifications_required"],
	] as const) {
		invoke.mockRejectedValueOnce(`${native}: /private/internal/path`);
		await act(async () => result.current.start("Meeting"));
		expect(result.current.error).toBe(expected);
	}
});
