// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MeetingRecorderPanel, recordingDuration } from "./meeting-recorder-panel.tsx";
import type { MeetingRecorderController } from "./types.ts";

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

test("recording panel starts a titled native recording without transcription controls", () => {
	const recorder = controller();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderPanel recorder={recorder} />
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
			<MeetingRecorderPanel recorder={recorder} />
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
			<MeetingRecorderPanel recorder={recorder} microphoneOccupied />
		</I18nextProvider>,
	);
	expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
	expect(recorder.start).not.toHaveBeenCalled();
	expect(recorder.stop).not.toHaveBeenCalled();
});
