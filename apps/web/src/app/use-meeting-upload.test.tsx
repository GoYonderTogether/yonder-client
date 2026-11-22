// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import {
	MEETING_RESUME_WINDOW_MS,
	type MeetingRecorderController,
	type MeetingRecording,
} from "@yonder/feature-meetings";
import { afterEach, expect, test, vi } from "vitest";
import { useMeetingUpload } from "./use-meeting-upload.ts";

const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("../lib/upload-meeting-audio.ts", () => ({ uploadMeetingAudio: upload }));
vi.mock("../lib/keychain.ts", () => ({ isTauri: () => false }));
vi.mock("@yonder/ui-data", () => ({
	keys: { items: { all: () => ["items"] } },
	useData: () => ({ client: {}, api: {}, storage: { get: () => null, set: vi.fn() } }),
	useDataQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
afterEach(() => vi.clearAllMocks());

function recording(id: string, patch: Partial<MeetingRecording>): MeetingRecording {
	return {
		id,
		ownerId: "person",
		title: id,
		conversationId: "conversation",
		state: "ended",
		startedAt: 0,
		endedAt: Date.now(),
		durationMs: 4000,
		savedDurationMs: 4000,
		sampleRate: 16000,
		channels: 1,
		segments: [{ index: 0, durationMs: 4000, byteLength: 10 }],
		error: null,
		...patch,
	};
}

function recorder(recordings: MeetingRecording[]): MeetingRecorderController {
	return {
		state: { supported: true, activeId: null, recordings },
		ready: true,
		busy: false,
		start: vi.fn(),
		stop: vi.fn(),
		reload: vi.fn(),
		readAudio: vi.fn(),
	};
}

test("notes start for a finished recording and for an interruption whose window has closed, not before", async () => {
	const now = Date.now();
	upload.mockResolvedValue({});
	renderHook(() =>
		useMeetingUpload(
			"person",
			recorder([
				recording("finished", {}),
				recording("fresh-cut", { state: "interrupted", endedAt: now - 60_000, error: "page_closed" }),
				recording("old-cut", {
					state: "interrupted",
					endedAt: now - MEETING_RESUME_WINDOW_MS - 1000,
					error: "page_closed",
				}),
				recording("damaged-cut", { state: "interrupted", endedAt: now - 1000, error: "audio_storage_failed" }),
			]),
		),
	);
	await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
	const sent = upload.mock.calls.map(([, item]) => (item as MeetingRecording).id).sort();
	expect(sent).toEqual(["damaged-cut", "finished", "old-cut"]);
});
