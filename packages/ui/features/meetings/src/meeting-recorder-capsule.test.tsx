// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MeetingRecord } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MeetingProcessing } from "./meeting-processing.tsx";
import { MeetingRecorderCapsule, recordingDuration } from "./meeting-recorder-capsule.tsx";
import type { MeetingCloudController, MeetingRecorderController } from "./types.ts";

function controller(): MeetingRecorderController {
	return {
		state: { supported: true, activeId: null, recordings: [] },
		ready: true,
		busy: false,
		error: null,
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		reload: vi.fn().mockResolvedValue(undefined),
		readAudio: vi.fn(),
	};
}

test("recording capsule starts a titled native recording without live transcription controls", () => {
	const recorder = controller();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule expanded onToggle={vi.fn()} recorder={recorder} />
		</I18nextProvider>,
	);
	fireEvent.change(screen.getByRole("textbox", { name: "Recording title" }), { target: { value: "Planning" } });
	fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
	expect(recorder.start).toHaveBeenCalledWith("Planning");
	expect(screen.queryByRole("switch")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: /transcrib|summari|resume/i })).not.toBeInTheDocument();
	expect(recordingDuration(3_661_999)).toBe("01:01:01");
});

test("interrupted recordings expose saved audio and no resume action", () => {
	const recorder = controller();
	recorder.state.recordings = [
		{
			id: "one",
			ownerId: "person",
			title: "Planning",
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
	];
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule expanded onToggle={vi.fn()} recorder={recorder} />
		</I18nextProvider>,
	);
	expect(screen.getByText("Interrupted")).toBeVisible();
	expect(screen.getByRole("button", { name: "Play saved audio" })).toBeEnabled();
	expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument();
});

test("chat voice input blocks meeting startup without stopping either recorder", () => {
	const recorder = controller();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule expanded onToggle={vi.fn()} recorder={recorder} microphoneOccupied />
		</I18nextProvider>,
	);
	expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
	expect(recorder.start).not.toHaveBeenCalled();
	expect(recorder.stop).not.toHaveBeenCalled();
});

test("a collapsed capsule keeps end recording available and toggling does not stop capture", () => {
	const recorder = controller();
	recorder.state.activeId = "active";
	recorder.state.recordings = [
		{
			id: "active",
			ownerId: "person",
			title: "Synthetic UI check",
			state: "recording",
			startedAt: 1,
			endedAt: null,
			durationMs: 8000,
			savedDurationMs: 4000,
			sampleRate: 16000,
			channels: 1,
			segments: [],
			error: null,
		},
	];
	const toggle = vi.fn();
	const view = render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule recorder={recorder} expanded={false} onToggle={toggle} />
		</I18nextProvider>,
	);
	expect(screen.getByRole("button", { name: "End recording" })).toBeEnabled();
	fireEvent.click(screen.getByRole("button", { expanded: false }));
	expect(toggle).toHaveBeenCalledOnce();
	expect(recorder.stop).not.toHaveBeenCalled();
	view.unmount();
	expect(recorder.stop).not.toHaveBeenCalled();
});

test("unknown processing requires cost acknowledgement and displays only actual saved text", () => {
	const meeting: MeetingRecord = {
		id: "mtg_check",
		clientRecordingId: "local",
		conversationId: "conversation",
		title: "Synthetic UI check",
		sourceState: "ended",
		startedAt: 1,
		endedAt: 2,
		durationMs: 4000,
		uploadedDurationMs: 4000,
		status: "unknown",
		segments: [],
		batches: [],
		transcript: "First sentence. Second sentence. Last sentence.",
		summary: null,
		summaryRunId: null,
		resultMessageId: null,
		failedStage: "summary",
		errorCode: "result_unknown",
	};
	const cloud: MeetingCloudController = {
		records: [meeting],
		selected: meeting,
		jobs: [],
		loading: false,
		error: false,
		busy: false,
		uploadAvailable: false,
		targetName: "Bot",
		select: vi.fn(),
		prepare: vi.fn(),
		retry: vi.fn(),
		reload: vi.fn(),
	};
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingProcessing meeting={meeting} cloud={cloud} />
		</I18nextProvider>,
	);
	expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
	expect(cloud.retry).not.toHaveBeenCalled();
	expect(screen.getAllByText(meeting.transcript).length).toBeGreaterThan(0);
	expect(screen.queryByText("Meeting notes")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(cloud.retry).toHaveBeenCalledExactlyOnceWith("mtg_check", true);
});
