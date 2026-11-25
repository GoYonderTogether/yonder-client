import { expect, test } from "vitest";
import type { MeetingPhoto } from "../lib/meeting-photos.ts";
import { liveRecordingTimeline, liveTranscriptEntries } from "./live-transcript.ts";

const photo = (id: string, elapsedMs: number): MeetingPhoto => ({
	id,
	elapsedMs,
	ownerId: "owner",
	recordingId: "recording",
	image: new Blob(),
});

test("late turns put a photo between known offsets without splitting speech or inventing a time for fallback", () => {
	const transcript = liveTranscriptEntries(
		[
			"00:00:01.200–00:00:03.600 第1段说话人1：A.",
			"00:00:04.300–00:00:06.200 第1段说话人1：B.",
			"00:00:06.300–00:00:07.100 第1段说话人1：C.",
			"00:00:07.300–00:00:08.100 第2段说话人1：D.",
			"00:00:08.200–00:00:08.400 归属待确认：E. 归属待确认",
			"00:00:08.500–00:00:08.600 归属待确认：F.",
			"第3段 · 说话人归属待确认",
			"12:30 is fine.",
		].join("\n"),
	);
	const shots = [photo("tail", 9900), photo("in-turn", 2500)];
	const speech = (items: ReturnType<typeof liveRecordingTimeline>) =>
		items.map((item) => (item.kind === "speech" ? item.text : item.photo.id));
	expect(speech(liveRecordingTimeline(transcript.slice(0, 1), shots))).toEqual(["A.", "in-turn", "tail"]);
	const timeline = liveRecordingTimeline(transcript, shots);
	expect(speech(timeline)).toEqual(["A.", "in-turn", "B. C.", "D.", "E. 归属待确认", "F.", "12:30 is fine.", "tail"]);
	expect(timeline[2]).toMatchObject({
		timing: { startMs: 4300, endMs: 7100 },
		turns: [{ timing: { startMs: 4300, endMs: 6200 } }, { timing: { startMs: 6300, endMs: 7100 } }],
	});
	expect(timeline[6]).not.toHaveProperty("timing");
});

test("a photo due between two same-speaker sentences keeps them as separate entries", () => {
	const transcript = liveTranscriptEntries(
		["00:00:01.000–00:00:02.000 第1段说话人1：A.", "00:00:02.500–00:00:03.000 第1段说话人1：B."].join("\n"),
	);
	const items = liveRecordingTimeline(transcript, [photo("mid", 2500)]);
	expect(items.map((item) => (item.kind === "speech" ? item.text : item.photo.id))).toEqual(["A.", "mid", "B."]);
});

test("matching labels do not bridge long pauses or become huge combined paragraphs", () => {
	const long = "a".repeat(239);
	const turns = liveTranscriptEntries(
		[
			"00:00:00.000–00:00:01.000 第1段说话人1：A.",
			`00:00:07.000–00:00:08.000 第1段说话人1：${long}`,
			"00:00:08.020–00:00:09.000 第1段说话人1：B.",
		].join("\n"),
	);
	expect(liveRecordingTimeline(turns, [])).toEqual(turns);
});
