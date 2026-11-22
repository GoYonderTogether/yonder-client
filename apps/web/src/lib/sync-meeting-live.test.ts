import { MEETING_RESUME_WINDOW_MS, type MeetingRecording } from "@yonder/feature-meetings";
import type { LiveMeetingProgress, MeetingRecord } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { shouldSyncMeeting, syncMeetingLive } from "./sync-meeting-live.ts";

function setup(patch: Partial<MeetingRecording> = {}) {
	const time = Date.now();
	const recording: MeetingRecording = {
		id: "local-recorder",
		ownerId: "owner",
		conversationId: "conversation",
		transportMode: "live",
		title: "Meeting",
		state: "recording",
		startedAt: time - 10_000,
		endedAt: null,
		durationMs: 8000,
		savedDurationMs: 8000,
		sampleRate: 16000,
		channels: 1,
		segments: [0, 1].map((index) => ({ index, durationMs: 4000, byteLength: 30 })),
		error: null,
		...patch,
	};
	const status = (nextSegmentIndex: number): LiveMeetingProgress => ({
		meetingId: "cloud-meeting",
		nextSegmentIndex,
		committedThroughSegmentIndex: -1,
		transcript: "",
		recording: true,
		captureState: "recording",
		lastClientSeenAt: time,
		errorCode: null,
	});
	const api = {
		startLiveMeeting: vi.fn().mockResolvedValue(status(1)),
		liveMeeting: vi.fn().mockResolvedValue(status(1)),
		checkpointLiveMeeting: vi.fn(async (_id, captureState) => ({ ...status(1), captureState })),
		uploadLiveMeetingSegment: vi.fn().mockResolvedValue(status(2)),
		finalizeLiveMeeting: vi.fn().mockResolvedValue({} as MeetingRecord),
	};
	const controller = new AbortController();
	const readAudio = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
	const drainPhotos = vi.fn().mockResolvedValue(2);
	return {
		api,
		recording,
		controller,
		signal: controller.signal,
		readAudio,
		drainPhotos,
		onProgress: vi.fn(),
		assertOwner: vi.fn(),
	};
}

test("resuming a persisted recording joins its idempotent cloud task and sends only missing durable segments", async () => {
	const f = setup();
	expect(await syncMeetingLive(f)).toBe(false);
	expect(f.api.startLiveMeeting).toHaveBeenCalledWith(
		expect.objectContaining({
			clientRecordingId: f.recording.id,
			conversationId: f.recording.conversationId,
			transportMode: "live",
		}),
		f.signal,
	);
	expect(f.readAudio.mock.calls).toEqual([[f.recording.id, 1]]);
	expect(f.api.uploadLiveMeetingSegment).toHaveBeenCalledOnce();
	expect(f.api.finalizeLiveMeeting).not.toHaveBeenCalled();
});

test("normal recording sends no data before stop, then catches up and waits for local photos before sealing", async () => {
	const f = setup({ transportMode: "record" });
	expect(shouldSyncMeeting(f.recording, Date.now())).toBe(false);
	expect(await syncMeetingLive(f)).toBe(false);
	expect(f.api.startLiveMeeting).not.toHaveBeenCalled();
	const endedAt = Date.now();
	expect(await syncMeetingLive({ ...f, recording: { ...f.recording, state: "ended", endedAt } })).toBe(true);
	expect(f.api.startLiveMeeting).toHaveBeenCalledWith(expect.objectContaining({ transportMode: "record" }), f.signal);
	expect(f.drainPhotos).toHaveBeenCalledBefore(f.api.finalizeLiveMeeting);
	expect(f.api.finalizeLiveMeeting).toHaveBeenCalledWith(
		"cloud-meeting",
		{
			state: "ended",
			endedAt,
			segmentCount: 2,
			photoCount: 2,
		},
		f.signal,
	);
});

test("interruption within the continuation window never seals, then catches up from the current server cursor", async () => {
	const f = setup({ state: "interrupted", endedAt: Date.now() - 5000 });
	expect(await syncMeetingLive(f)).toBe(false);
	expect(f.api.finalizeLiveMeeting).not.toHaveBeenCalled();
	f.api.liveMeeting.mockResolvedValue({
		meetingId: "cloud-meeting",
		nextSegmentIndex: 2,
		committedThroughSegmentIndex: 1,
		transcript: "Held",
		captureState: "interrupted",
		lastClientSeenAt: Date.now(),
		recording: true,
		errorCode: null,
	});
	const endedAt = Date.now() - 700_000;
	expect(await syncMeetingLive({ ...f, meetingId: "cloud-meeting", recording: { ...f.recording, endedAt } })).toBe(
		true,
	);
	expect(f.readAudio).toHaveBeenCalledOnce();
	expect(f.api.finalizeLiveMeeting).toHaveBeenCalledWith(
		"cloud-meeting",
		expect.objectContaining({ state: "interrupted", endedAt }),
		f.signal,
	);
});

test("owner abort after reading durable bytes never sends them", async () => {
	const f = setup();
	f.readAudio.mockImplementationOnce(async () => {
		f.controller.abort();
		return new Uint8Array([1]);
	});
	await expect(syncMeetingLive(f)).rejects.toThrow();
	expect(f.api.uploadLiveMeetingSegment).not.toHaveBeenCalled();
});

test("failure to archive a photo is recoverable and cannot silently finish the task", async () => {
	const f = setup({ state: "ended", endedAt: Date.now() });
	f.drainPhotos.mockRejectedValueOnce(new Error("offline"));
	await expect(syncMeetingLive(f)).rejects.toThrow("offline");
	expect(f.api.finalizeLiveMeeting).not.toHaveBeenCalled();
});

test("reconnect reports an observed interruption before recording resumes without repeating an unchanged state", async () => {
	const f = setup();
	await syncMeetingLive({ ...f, captureState: "recording", notifyInterruption: true });
	expect(f.api.checkpointLiveMeeting.mock.calls.map(([, state]) => state)).toEqual(["interrupted", "recording"]);
	f.api.checkpointLiveMeeting.mockClear();
	await syncMeetingLive({ ...f, captureState: "recording" });
	expect(f.api.checkpointLiveMeeting).not.toHaveBeenCalled();
});

test("a photo-only recording seals without invoking speech; an empty recording stays local", async () => {
	const endedAt = Date.now();
	const f = setup({ segments: [], state: "ended", endedAt, transportMode: "record" });
	f.api.startLiveMeeting.mockResolvedValueOnce({
		meetingId: "cloud-meeting",
		nextSegmentIndex: 0,
		committedThroughSegmentIndex: -1,
		transcript: "",
		captureState: "recording",
		lastClientSeenAt: endedAt,
		recording: true,
		errorCode: null,
	});
	expect(await syncMeetingLive(f)).toBe(false);
	expect(f.api.startLiveMeeting).not.toHaveBeenCalled();
	expect(await syncMeetingLive({ ...f, localPhotoCount: 2 })).toBe(true);
	expect(f.readAudio).not.toHaveBeenCalled();
	expect(f.api.uploadLiveMeetingSegment).not.toHaveBeenCalled();
	expect(f.api.finalizeLiveMeeting).toHaveBeenCalledWith(
		"cloud-meeting",
		{ endedAt, state: "ended", segmentCount: 0, photoCount: 2 },
		f.signal,
	);
});

test("interrupted photo-only captures remain local until the resume window expires", async () => {
	const time = Date.now();
	const f = setup({ segments: [], state: "interrupted", endedAt: time });
	const params = { ...f, localPhotoCount: 2 };
	expect(shouldSyncMeeting(f.recording, time + MEETING_RESUME_WINDOW_MS - 1, 2)).toBe(false);
	expect(shouldSyncMeeting(f.recording, time + MEETING_RESUME_WINDOW_MS, 2)).toBe(true);
	expect(await syncMeetingLive(params)).toBe(false);
	expect(f.api.startLiveMeeting).not.toHaveBeenCalled();
	expect(f.drainPhotos).not.toHaveBeenCalled();
	expect(f.api.finalizeLiveMeeting).not.toHaveBeenCalled();

	const endedAt = time - MEETING_RESUME_WINDOW_MS;
	f.api.startLiveMeeting.mockResolvedValueOnce({
		meetingId: "cloud-meeting",
		nextSegmentIndex: 0,
		committedThroughSegmentIndex: -1,
		transcript: "",
		captureState: "recording",
		lastClientSeenAt: time,
		recording: true,
		errorCode: null,
	});
	expect(await syncMeetingLive({ ...params, recording: { ...f.recording, endedAt } })).toBe(true);
	expect(f.api.finalizeLiveMeeting).toHaveBeenCalledWith(
		"cloud-meeting",
		{ endedAt, state: "interrupted", segmentCount: 0, photoCount: 2 },
		f.signal,
	);
});

test("a missing local index does not skip audio or seal a partial meeting", async () => {
	const f = setup({ state: "ended", endedAt: Date.now() });
	f.recording.segments[1] = { index: 2, durationMs: 1000, byteLength: 30 };
	await expect(syncMeetingLive(f)).rejects.toThrow("missing_local_recording_segment");
	expect(f.readAudio).not.toHaveBeenCalled();
	expect(f.api.finalizeLiveMeeting).not.toHaveBeenCalled();
});

test.each([
	[" Sa\u0303o Paulo ", "São Paulo"],
	["31.23, 121.47", undefined],
	[undefined, undefined],
])("finalize forwards only an authorized and well-formed optional locality (%s)", async (locality, expected) => {
	const f = setup({ state: "ended", endedAt: Date.now() });
	expect(await syncMeetingLive({ ...f, ...(locality ? { locality } : {}) })).toBe(true);
	expect(f.api.startLiveMeeting.mock.calls[0]?.[0]).not.toHaveProperty("locality");
	const payload = f.api.finalizeLiveMeeting.mock.calls[0]?.[1];
	if (expected) expect(payload).toHaveProperty("locality", expected);
	else expect(payload).not.toHaveProperty("locality");
});
