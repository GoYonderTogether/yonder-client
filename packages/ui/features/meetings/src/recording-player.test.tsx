// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { RecordingPlayer } from "./recording-player.tsx";
import type { MeetingRecording } from "./types.ts";

test("playback loads one saved segment at a time and releases audio when the panel closes", async () => {
	const audio: {
		onended?: () => void;
		onerror?: () => void;
		pause: ReturnType<typeof vi.fn>;
		play: ReturnType<typeof vi.fn>;
	}[] = [];
	vi.stubGlobal(
		"Audio",
		class {
			onended?: () => void;
			onerror?: () => void;
			pause = vi.fn();
			play = vi.fn().mockResolvedValue(undefined);
			constructor() {
				audio.push(this);
			}
		},
	);
	const create = vi.fn().mockReturnValue("blob:segment");
	const revoke = vi.fn();
	vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
	const read = vi.fn().mockResolvedValue(new Uint8Array([82, 73, 70, 70]));
	const recording: MeetingRecording = {
		id: "meeting",
		ownerId: "person",
		title: "Meeting",
		state: "ended",
		startedAt: 1,
		endedAt: 2,
		durationMs: 8000,
		savedDurationMs: 8000,
		sampleRate: 16000,
		channels: 1,
		segments: [0, 1].map((index) => ({ index, durationMs: 4000, byteLength: 128044 })),
		error: null,
	};
	try {
		const view = render(
			<I18nextProvider i18n={createI18n("en")}>
				<RecordingPlayer recording={recording} readAudio={read} />
			</I18nextProvider>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Play saved audio" }));
		await waitFor(() => expect(audio[0]?.play).toHaveBeenCalledOnce());
		expect(read).toHaveBeenCalledExactlyOnceWith("meeting", 0);
		await act(async () => audio[0]?.onended?.());
		await waitFor(() => expect(read).toHaveBeenLastCalledWith("meeting", 1));
		expect(audio[0]?.pause).toHaveBeenCalledOnce();
		view.unmount();
		expect(audio[1]?.pause).toHaveBeenCalledOnce();
		expect(revoke).toHaveBeenCalledTimes(2);
	} finally {
		vi.unstubAllGlobals();
	}
});
