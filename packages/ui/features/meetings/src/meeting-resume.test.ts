import { expect, test } from "vitest";
import {
	automaticResume,
	MEETING_RESUME_WINDOW_MS,
	meetingUploadReady,
	resumableMeeting,
	resumeDeadline,
} from "./meeting-resume.ts";
import type { MeetingRecording } from "./types.ts";

const END = 1_000_000;
function recording(patch: Partial<MeetingRecording> = {}): MeetingRecording {
	return {
		id: "r",
		ownerId: "o",
		title: "t",
		state: "interrupted",
		startedAt: 0,
		endedAt: END,
		durationMs: 8000,
		savedDurationMs: 8000,
		sampleRate: 16000,
		channels: 1,
		segments: [{ index: 0, durationMs: 8000, byteLength: 100 }],
		error: "page_closed",
		...patch,
	};
}

test("an interrupted recording can be continued for exactly ten minutes", () => {
	expect(resumeDeadline(recording())).toBe(END + MEETING_RESUME_WINDOW_MS);
	expect(resumableMeeting([recording()], END + MEETING_RESUME_WINDOW_MS - 1)?.id).toBe("r");
	expect(resumableMeeting([recording()], END + MEETING_RESUME_WINDOW_MS)).toBeUndefined();
});

test("nothing is continued when there is no audio, no end time or the storage failed", () => {
	expect(resumeDeadline(recording({ segments: [] }))).toBeNull();
	expect(resumeDeadline(recording({ endedAt: null }))).toBeNull();
	expect(resumeDeadline(recording({ error: "audio_storage_failed" }))).toBeNull();
	expect(resumeDeadline(recording({ error: "audio_segment_damaged" }))).toBeNull();
	expect(resumeDeadline(recording({ state: "ended" }))).toBeNull();
});

test("notes start once the user ends the recording or the window has closed", () => {
	expect(meetingUploadReady(recording({ state: "ended", error: null }), END)).toBe(true);
	expect(meetingUploadReady(recording(), END + 1000)).toBe(false);
	expect(meetingUploadReady(recording(), END + MEETING_RESUME_WINDOW_MS)).toBe(true);
	expect(meetingUploadReady(recording({ error: "audio_storage_failed" }), END)).toBe(true);
	expect(meetingUploadReady(recording({ state: "recording", endedAt: null }), END)).toBe(false);
	expect(meetingUploadReady(recording({ segments: [] }), END + MEETING_RESUME_WINDOW_MS)).toBe(false);
});

test("only a brief audio loss is continued without asking", () => {
	expect(automaticResume(recording({ error: "audio_interrupted" }))).toBe(true);
	expect(automaticResume(recording({ error: "meeting_app_restarting" }))).toBe(false);
	expect(automaticResume(recording({ error: "page_closed" }))).toBe(false);
	expect(automaticResume(recording({ error: null }))).toBe(false);
});
