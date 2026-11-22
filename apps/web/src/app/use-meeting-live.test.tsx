// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { MeetingRecorderController, MeetingRecording } from "@yonder/feature-meetings";
import type { LiveMeetingProgress } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { useMeetingLive } from "./use-meeting-live.ts";

const { api, submitted } = vi.hoisted(() => ({
	api: {
		startLiveMeeting: vi.fn(),
		liveMeeting: vi.fn(),
		uploadLiveMeetingSegment: vi.fn(),
		finalizeLiveMeeting: vi.fn(),
	},
	submitted: vi.fn(),
}));
vi.mock("@yonder/ui-data", () => ({
	keys: { items: { all: () => ["items"] }, meetings: { all: () => ["meetings"] } },
	useData: () => ({ api, storage: { get: () => null, set: submitted } }),
	useDataQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("../lib/meeting-photos.ts", () => ({ drainMeetingPhotos: async () => 0, listMeetingPhotos: async () => [] }));

function progress(localId: string, transcript: string, nextSegmentIndex = 1): LiveMeetingProgress {
	return {
		meetingId: `cloud-${localId}`,
		nextSegmentIndex,
		committedThroughSegmentIndex: transcript ? nextSegmentIndex - 1 : -1,
		transcript,
		captureState: "recording",
		lastClientSeenAt: Date.now(),
		errorCode: null,
		recording: true,
	};
}

function recorder(id: string): MeetingRecorderController {
	const recording: MeetingRecording = {
		id,
		ownerId: "owner",
		conversationId: "chat",
		title: "Meeting",
		transportMode: "live",
		state: "recording",
		startedAt: 1,
		endedAt: null,
		durationMs: 4000,
		savedDurationMs: 4000,
		sampleRate: 16000,
		channels: 1,
		segments: [{ index: 0, durationMs: 4000, byteLength: 128044 }],
		error: null,
	};
	return {
		state: { activeId: id, recordings: [recording], supported: true },
		ready: true,
		busy: false,
		start: vi.fn(),
		stop: vi.fn(),
		reload: vi.fn(),
		readAudio: vi.fn().mockResolvedValue(new Uint8Array([1])),
	};
}

test("successive recordings isolate late status and transcripts by local recording ID", async () => {
	vi.useFakeTimers();
	api.startLiveMeeting.mockImplementation(async ({ clientRecordingId }: { clientRecordingId: string }) =>
		progress(clientRecordingId, `Text for ${clientRecordingId}`),
	);
	let finishOld: (status: LiveMeetingProgress) => void = () => undefined;
	api.liveMeeting.mockImplementationOnce(
		() =>
			new Promise<LiveMeetingProgress>((resolve) => {
				finishOld = resolve;
			}),
	);
	const { result, rerender, unmount } = renderHook(({ id }) => useMeetingLive("owner", recorder(id)), {
		initialProps: { id: "first" },
	});
	try {
		await act(async () => undefined);
		expect(result.current.caption).toMatchObject({ recordingId: "first", text: "Text for first" });
		await act(async () => vi.advanceTimersByTimeAsync(1000));
		expect(api.liveMeeting).toHaveBeenCalledWith("cloud-first", expect.any(AbortSignal));
		rerender({ id: "second" });
		expect(result.current.caption).toBeNull();
		expect(result.current.audioAccepted).toBe(false);
		await act(async () => finishOld(progress("first", "Late first transcript")));
		expect(result.current.caption).toBeNull();
		await act(async () => vi.advanceTimersByTimeAsync(1000));
		expect(result.current.caption).toMatchObject({ recordingId: "second", text: "Text for second" });
		expect(api.startLiveMeeting.mock.calls.map(([input]) => input.clientRecordingId)).toEqual(["first", "second"]);
	} finally {
		unmount();
		vi.useRealTimers();
		api.startLiveMeeting.mockReset();
		api.liveMeeting.mockReset();
	}
});

test.each(["status", "finalize"] as const)(
	"prior %s stays pending while both new segments are acknowledged and the first new caption appears",
	async (held) => {
		vi.useFakeTimers();
		const first = recorder("first");
		const second = recorder("second");
		const [firstRecording] = first.state.recordings;
		const [secondRecording] = second.state.recordings;
		if (!firstRecording || !secondRecording) throw new Error("Missing fixture recording");
		const ended: MeetingRecording = { ...firstRecording, state: "ended", endedAt: 5000 };
		const stopped = { ...first, state: { ...first.state, activeId: null, recordings: [ended] } };
		const extra = { ...ended, id: "other-backlog" };
		const newCapture = (withSecondSegment: boolean) => ({
			...second,
			state: {
				...second.state,
				recordings: [
					ended,
					withSecondSegment
						? {
								...secondRecording,
								segments: [...secondRecording.segments, { index: 1, durationMs: 4000, byteLength: 128044 }],
							}
						: secondRecording,
					extra,
				],
			},
		});
		let release: (() => void) | undefined;
		let acknowledged = 0;
		let showCaption = false;
		api.startLiveMeeting.mockImplementation(async ({ clientRecordingId }: { clientRecordingId: string }) =>
			progress(clientRecordingId, "", clientRecordingId === "second" ? 0 : 1),
		);
		api.liveMeeting.mockImplementation((id: string) => {
			if (id === "cloud-first" && held === "status" && !release) {
				return new Promise<LiveMeetingProgress>((resolve) => {
					release = () => resolve(progress("first", "Old text must not be displayed"));
				});
			}
			return Promise.resolve(
				id === "cloud-first"
					? progress("first", "Old text")
					: progress("second", showCaption ? "New synthetic caption" : "", acknowledged),
			);
		});
		api.uploadLiveMeetingSegment.mockImplementation(async (id: string, index: number) => {
			expect(id).toBe("cloud-second");
			expect(index).toBe(acknowledged++);
			return progress("second", "", acknowledged);
		});
		api.finalizeLiveMeeting.mockImplementation((id: string) => {
			if (id === "cloud-first" && held === "finalize" && !release) {
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			}
			return Promise.resolve();
		});
		const { result, rerender, unmount } = renderHook(({ capture }) => useMeetingLive("owner", capture), {
			initialProps: { capture: first },
		});
		try {
			await act(async () => undefined);
			rerender({ capture: stopped });
			await act(async () => vi.advanceTimersByTimeAsync(1000));
			expect(release).toBeTypeOf("function");

			rerender({ capture: newCapture(false) });
			await act(async () => vi.advanceTimersByTimeAsync(1000));
			expect(result.current.audioAccepted).toBe(true);
			expect(acknowledged).toBe(1);
			expect(result.current.caption).toBeNull();
			rerender({ capture: newCapture(true) });
			await act(async () => vi.advanceTimersByTimeAsync(1000));
			expect(acknowledged).toBe(2);
			expect(result.current.caption).toBeNull();
			showCaption = true;
			await act(async () => vi.advanceTimersByTimeAsync(1000));
			expect(result.current.caption).toMatchObject({
				recordingId: "second",
				text: "New synthetic caption",
				segmentIndex: 1,
			});
			expect(submitted).not.toHaveBeenCalled();
			expect(api.startLiveMeeting.mock.calls.map(([input]) => input.clientRecordingId)).toEqual(["first", "second"]);
			expect(api.liveMeeting.mock.calls.filter(([id]) => id === "cloud-first")).toHaveLength(1);
			expect(api.uploadLiveMeetingSegment.mock.calls.map(([id, index]) => [id, index])).toEqual([
				["cloud-second", 0],
				["cloud-second", 1],
			]);

			await act(async () => release?.());
			expect(api.finalizeLiveMeeting).toHaveBeenCalledExactlyOnceWith(
				"cloud-first",
				{ endedAt: 5000, state: "ended", segmentCount: 1, photoCount: 0 },
				expect.any(AbortSignal),
			);
			expect(submitted).toHaveBeenCalledExactlyOnceWith("meeting-live-submitted.owner.first", "1");
			expect(result.current.caption).toMatchObject({ recordingId: "second", text: "New synthetic caption" });
		} finally {
			unmount();
			vi.useRealTimers();
			for (const mock of Object.values(api)) mock.mockReset();
			submitted.mockReset();
		}
	},
);

test("two in-flight recordings cap rapid switching and sign-out fences both late responses", async () => {
	vi.useFakeTimers();
	const pending: { signal: AbortSignal; release: () => void }[] = [];
	const hold = (signal: AbortSignal, status: LiveMeetingProgress) =>
		new Promise<LiveMeetingProgress>((resolve) => {
			pending.push({ signal, release: () => resolve(status) });
		});
	api.startLiveMeeting.mockImplementation(
		({ clientRecordingId }: { clientRecordingId: string }, signal: AbortSignal) =>
			clientRecordingId === "first"
				? Promise.resolve(progress("first", "Original"))
				: hold(signal, progress(clientRecordingId, "", 0)),
	);
	api.liveMeeting.mockImplementation((_id: string, signal: AbortSignal) => hold(signal, progress("first", "Stale")));
	const { result, rerender, unmount } = renderHook<
		ReturnType<typeof useMeetingLive>,
		{ owner: string | null; capture: MeetingRecorderController }
	>(({ owner, capture }) => useMeetingLive(owner, capture), {
		initialProps: { owner: "owner", capture: recorder("first") },
	});
	try {
		await act(async () => undefined);
		await act(async () => vi.advanceTimersByTimeAsync(1000));
		rerender({ owner: "owner", capture: recorder("second") });
		await act(async () => vi.advanceTimersByTimeAsync(1000));
		expect(pending).toHaveLength(2);
		rerender({ owner: "owner", capture: recorder("third") });
		await act(async () => vi.advanceTimersByTimeAsync(2000));
		expect(api.startLiveMeeting.mock.calls.map(([input]) => input.clientRecordingId)).toEqual(["first", "second"]);
		expect(pending.every(({ signal }) => !signal.aborted)).toBe(true);
		rerender({ owner: null, capture: recorder("third") });
		expect(pending.every(({ signal }) => signal.aborted)).toBe(true);
		await act(async () => {
			for (const item of pending) item.release();
			await vi.advanceTimersByTimeAsync(3000);
		});
		expect(result.current.caption).toBeNull();
		expect(api.uploadLiveMeetingSegment).not.toHaveBeenCalled();
		expect(api.finalizeLiveMeeting).not.toHaveBeenCalled();
		expect(submitted).not.toHaveBeenCalled();
	} finally {
		unmount();
		vi.useRealTimers();
		for (const mock of Object.values(api)) mock.mockReset();
		submitted.mockReset();
	}
});
