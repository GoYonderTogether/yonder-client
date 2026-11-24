// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MeetingRecorderController, MeetingRecording } from "@yonder/feature-meetings";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { useMeetingRecordingSurface } from "./meeting-recording-surface.tsx";

vi.mock("../lib/meeting-photos.ts", () => ({ listMeetingPhotos: async () => [], MEETING_PHOTO_LIMIT: 20 }));

const active: MeetingRecording & { transportMode: "live" } = {
	id: "recording",
	ownerId: "owner",
	title: "Meeting",
	conversationId: "source",
	transportMode: "live",
	state: "recording",
	startedAt: 1,
	endedAt: null,
	durationMs: 12000,
	savedDurationMs: 5000,
	sampleRate: 16000,
	channels: 1,
	segments: [],
	error: null,
};
function controller(recording: MeetingRecording | undefined): MeetingRecorderController {
	return {
		state: { supported: true, recordings: recording ? [recording] : [], activeId: recording?.id ?? null },
		ready: true,
		busy: false,
		start: vi.fn(),
		stop: vi.fn(),
		resume: vi.fn(),
		reload: vi.fn(),
		readAudio: vi.fn(),
	};
}

function Harness({
	source,
	recovery,
	offline,
	recorder,
}: {
	source: string;
	recovery?: boolean;
	offline?: boolean;
	recorder: MeetingRecorderController;
}) {
	const surface = useMeetingRecordingSurface(
		"owner",
		source,
		{
			recorder,
			active: recovery ? undefined : active,
			interrupted: recovery ? { ...active, state: "interrupted" } : undefined,
			start: vi.fn(),
			live: {
				transcript: [
					"00:00:00.000–00:00:01.500 第1段说话人1：First line.",
					"00:00:01.600–00:00:02.900 归属待确认：我说了归属待确认。",
					"第2段 · 说话人归属待确认",
					"12:30 is the next checkpoint.",
					"00:00:12.000–00:00:13.000 归属待确认：Last line.",
				].join("\n"),
				caption: {
					recordingId: active.id,
					conversationId: "source",
					text: "00:00:12.000–00:00:13.000 归属待确认：Last line.",
					segmentIndex: 1,
					isFinal: true,
				},
				offline: Boolean(offline),
			},
		},
		vi.fn(),
	);
	return (
		<>
			{surface.status}
			{surface.dialog}
		</>
	);
}

const i18n = createI18n("en");

test("transcript expands from its source only; elsewhere the live timer and end remain", async () => {
	const recorder = controller(active);
	const view = (source: string) => (
		<I18nextProvider i18n={i18n}>
			<Harness source={source} recorder={recorder} />
		</I18nextProvider>
	);
	const screenView = render(view("source"));
	const reading = await screen.findByRole("dialog", { name: "Live transcript" });
	const log = within(reading).getByRole("log");
	expect([...log.querySelectorAll("p")].map((entry) => entry.textContent)).toEqual([
		"First line.",
		"我说了归属待确认。",
		"12:30 is the next checkpoint.",
		"Last line.",
	]);
	expect([...log.querySelectorAll("time")].map((entry) => entry.textContent)).toEqual([
		"00:00:00.000–00:00:01.500",
		"00:00:01.600–00:00:02.900",
		"00:00:12.000–00:00:13.000",
	]);
	expect(log).not.toHaveTextContent("第1段说话人1");
	expect(log).not.toHaveTextContent("说话人归属待确认");
	expect(within(reading).queryByRole("button", { name: "Pause recording" })).not.toBeInTheDocument();
	fireEvent.click(within(reading).getByRole("button", { name: "Collapse recording" }));
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	const compact = screen.getByRole("region", { name: "Recording" });
	expect(compact).toHaveTextContent("Last line.");
	expect(compact).not.toHaveTextContent("归属待确认");
	screenView.rerender(view("another-bot"));
	expect(screen.queryByText("Last line.")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Expand recording" })).not.toBeInTheDocument();
	expect(screen.getByRole("status", { name: "Recording duration" })).toHaveTextContent("00:00:12");
	fireEvent.click(screen.getByRole("button", { name: "End recording" }));
	expect(recorder.stop).toHaveBeenCalledWith("recording");
	screenView.rerender(view("source"));
	expect(screen.getByRole("button", { name: "Expand recording" })).toBeVisible();
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("network loss keeps recording, but interrupted recovery offers saved duration and no live meter", async () => {
	const recorder = controller(active);
	const view = render(
		<I18nextProvider i18n={i18n}>
			<Harness source="source" recorder={recorder} offline />
		</I18nextProvider>,
	);
	const dialog = await screen.findByRole("dialog");
	expect(within(dialog).getByText("Recording continues. Transcription is paused offline.")).toBeVisible();
	const ended = controller(undefined);
	view.rerender(
		<I18nextProvider i18n={i18n}>
			<Harness source="source" recorder={ended} recovery />
		</I18nextProvider>,
	);
	const recovered = screen.getByRole("region", { name: "Interrupted" });
	expect(recovered).toHaveTextContent("00:00:05");
	expect(recovered).not.toHaveTextContent("Recording continues");
	expect(screen.queryByRole("meter")).not.toBeInTheDocument();
	fireEvent.click(within(recovered).getByRole("button", { name: "Resume recording" }));
	fireEvent.click(within(recovered).getByRole("button", { name: "End recording" }));
	expect(ended.resume).toHaveBeenCalledWith("recording");
	expect(ended.stop).toHaveBeenCalledWith("recording");
});
