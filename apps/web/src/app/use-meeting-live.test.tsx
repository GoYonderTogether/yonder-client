// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { MeetingRecorderController, MeetingRecording } from "@yonder/feature-meetings";
import type { LiveMeetingProgress } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { useMeetingLive } from "./use-meeting-live.ts";

const api = vi.hoisted(() => ({ startLiveMeeting: vi.fn(), liveMeeting: vi.fn() }));
vi.mock("@yonder/ui-data", () => ({
	keys: { items: { all: () => ["items"] }, meetings: { all: () => ["meetings"] } },
	useData: () => ({ api, storage: { get: () => null, set: vi.fn() } }),
	useDataQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function progress(localId: string, transcript: string): LiveMeetingProgress {
	return {
		meetingId: `cloud-${localId}`,
		nextSegmentIndex: 1,
		committedThroughSegmentIndex: 0,
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
		readAudio: vi.fn(),
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
