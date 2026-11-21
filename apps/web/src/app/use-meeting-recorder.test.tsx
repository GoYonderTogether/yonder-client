// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { MeetingRecorderState } from "@yonder/feature-meetings";
import { createI18n } from "@yonder/ui-i18n";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { AppNoticeProvider } from "./app-notice.tsx";
import { useFrameMeeting } from "./use-frame-meeting.ts";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";

const { invoke, supported } = vi.hoisted(() => ({ invoke: vi.fn(), supported: { value: true } }));
vi.mock("../lib/meeting-recorder.ts", async (original) => ({
	...(await original<object>()),
	invokeMeetingRecorder: invoke,
	meetingRecorderSupported: () => supported.value,
}));
vi.mock("./use-meeting-live.ts", () => ({
	useMeetingLive: () => ({ caption: null, offline: false, meetingId: null }),
}));
vi.mock("./use-meeting-upload.ts", () => ({ useMeetingUpload: () => {} }));
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

test("active capture samples levels every 100ms and discards a stale poll after stop", async () => {
	vi.useFakeTimers();
	let finishPoll: (state: MeetingRecorderState) => void = () => {};
	const active = { ...saved, activeId: "saved", audioLevel: 0.5 };
	invoke.mockResolvedValueOnce(active).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finishPoll = resolve;
			}),
	);
	const { result, unmount } = renderHook(() => useMeetingRecorder("person"));
	await act(async () => {});
	await act(async () => vi.advanceTimersByTimeAsync(100));
	expect(invoke).toHaveBeenCalledTimes(2);
	invoke.mockResolvedValueOnce(saved);
	await act(async () => result.current.stop("saved"));
	await act(async () => finishPoll(active));
	expect(result.current.state.activeId).toBeNull();
	unmount();
	vi.useRealTimers();
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
	const onActionError = vi.fn();
	const { result } = renderHook(() => useMeetingRecorder("person", onActionError));
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
		expect(onActionError).toHaveBeenLastCalledWith(expected);
	}
});

test("only an observed interruption of the active recording is announced", async () => {
	vi.useFakeTimers();
	invoke.mockResolvedValue(saved);
	const i18n = createI18n("en");
	const { unmount } = renderHook(() => useFrameMeeting("person"), {
		wrapper: ({ children }: { children: ReactNode }) => (
			<I18nextProvider i18n={i18n}>
				<AppNoticeProvider scope="person">{children}</AppNoticeProvider>
			</I18nextProvider>
		),
	});
	try {
		await act(async () => {});
		const status = screen.getByRole("status");
		expect(status.textContent).toBe("");
		invoke.mockResolvedValue({
			...saved,
			activeId: "saved",
			recordings: saved.recordings.map((recording) => ({ ...recording, state: "recording" })),
		});
		await act(async () => vi.advanceTimersByTimeAsync(1000));
		invoke.mockResolvedValue(saved);
		await act(async () => vi.advanceTimersByTimeAsync(100));
		expect(status.textContent).toBe(i18n.t("meetingRecorder.interrupted"));
		await act(async () => vi.advanceTimersByTimeAsync(5500));
		expect(status.textContent).toBe("");
	} finally {
		unmount();
		vi.useRealTimers();
	}
});
