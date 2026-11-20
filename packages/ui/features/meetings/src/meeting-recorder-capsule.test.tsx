// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MeetingRecorderCapsule, recordingDuration } from "./meeting-recorder-capsule.tsx";
import type { MeetingRecorderController } from "./types.ts";

test("the recording capsule shows active controls only and keeps time while paused", () => {
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
	const capsule = () => (
		<I18nextProvider i18n={createI18n("en")}>
			<MeetingRecorderCapsule recorder={recorder} />
		</I18nextProvider>
	);
	const view = render(capsule());
	expect(screen.getByRole("meter", { name: "Microphone level" })).toHaveValue(42);
	expect(screen.getByRole("status", { name: "Recording duration" })).toHaveTextContent("00:00:08");
	expect(document.querySelectorAll(".meeting-level-bars span")).toHaveLength(6);
	fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
	expect(recorder.pause).toHaveBeenCalledWith("active");
	recorder.state.paused = true;
	view.rerender(capsule());
	expect(screen.getByRole("region", { name: "Recording paused" })).toBeVisible();
	expect(screen.queryByRole("meter", { name: "Microphone level" })).not.toBeInTheDocument();
	expect(screen.getByRole("status", { name: "Recording duration" })).toHaveTextContent("00:00:08");
	fireEvent.click(screen.getByRole("button", { name: "Resume recording" }));
	expect(recorder.resume).toHaveBeenCalledWith("active");
	fireEvent.click(screen.getByRole("button", { name: "End recording" }));
	expect(recorder.stop).toHaveBeenCalledWith("active");
	recorder.state.activeId = null;
	view.rerender(capsule());
	expect(view.container).toBeEmptyDOMElement();
	expect(recordingDuration(3_661_999)).toBe("01:01:01");
});
