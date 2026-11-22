// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MeetingRecorderCapsule, recordingDuration } from "./meeting-recorder-capsule.tsx";
import type { MeetingRecorderController } from "./types.ts";

test("the source capsule shows only time, latest text, expand, and end", () => {
	const recorder: MeetingRecorderController = {
		state: {
			supported: true,
			activeId: "active",
			audioLevel: 0.42,
			pauseSupported: true,
			recordings: [
				{
					id: "active",
					ownerId: "person",
					title: "Meeting recording",
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
			],
		},
		ready: true,
		busy: false,
		start: vi.fn(),
		stop: vi.fn(),
		pause: vi.fn(),
		resume: vi.fn(),
		reload: vi.fn(),
		readAudio: vi.fn(),
	};
	const expand = vi.fn();
	const capsule = () => (
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule recorder={recorder} caption="Most recent line" onExpand={expand} />
		</I18nextProvider>
	);
	const view = render(capsule());
	expect(screen.getByRole("status", { name: "Recording duration" })).toHaveTextContent("00:00:08");
	expect(screen.getByText("Most recent line")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Pause recording" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Expand recording" }));
	expect(expand).toHaveBeenCalledOnce();
	fireEvent.click(screen.getByRole("button", { name: "End recording" }));
	expect(recorder.stop).toHaveBeenCalledWith("active");
	recorder.state.activeId = null;
	view.rerender(capsule());
	expect(view.container).toBeEmptyDOMElement();
	expect(recordingDuration(3_661_999)).toBe("01:01:01");
});

test("an interrupted recording shows Continue and End with a hint, until the window closes", () => {
	const now = Date.now();
	const recorder: MeetingRecorderController = {
		state: {
			supported: true,
			activeId: null,
			recordings: [
				{
					id: "cut",
					ownerId: "person",
					title: "Meeting",
					state: "interrupted",
					startedAt: now - 60_000,
					endedAt: now - 30_000,
					durationMs: 30_000,
					savedDurationMs: 30_000,
					sampleRate: 16000,
					channels: 1,
					segments: [{ index: 0, durationMs: 30_000, byteLength: 10 }],
					error: "page_closed",
				},
			],
		},
		ready: true,
		busy: false,
		start: vi.fn(),
		stop: vi.fn(),
		pause: vi.fn(),
		resume: vi.fn(),
		reload: vi.fn(),
		readAudio: vi.fn(),
	};
	const view = render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule recorder={recorder} />
		</I18nextProvider>,
	);
	expect(screen.getByRole("region", { name: "Recording interrupted" })).toBeVisible();
	expect(screen.getByRole("status", { name: "Recording duration" })).toHaveTextContent("00:00:30");
	expect(screen.getByText(/Continue within 10 min/)).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Continue recording" }));
	expect(recorder.resume).toHaveBeenCalledWith("cut");
	fireEvent.click(screen.getByRole("button", { name: "End and start notes" }));
	expect(recorder.stop).toHaveBeenCalledWith("cut");
	for (const item of recorder.state.recordings) item.endedAt = now - 11 * 60_000;
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule recorder={recorder} />
		</I18nextProvider>,
	);
	expect(view.container).toBeEmptyDOMElement();
});
