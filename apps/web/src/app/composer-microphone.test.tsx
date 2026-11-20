// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { Composer } from "./composer.tsx";

const voice = vi.hoisted(() => ({
	isListening: false,
	error: "",
	cancel: vi.fn(),
	start: vi.fn(),
	finish: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./use-voice-input.ts", () => ({ useVoiceInput: () => voice }));

test("meeting capture blocks only chat microphone startup, while its own pause stays available", () => {
	const onActivity = vi.fn();
	const props = {
		recipientName: "Bot",
		draft: "",
		onDraftChange: vi.fn(),
		onSend: vi.fn(),
		streaming: false,
		disabled: false,
		disconnected: false,
		sendOnEnter: true,
		microphoneOccupied: true,
		onVoiceActivityChange: onActivity,
	};
	const view = render(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} />
		</I18nextProvider>,
	);
	expect(screen.getByRole("button", { name: "Voice input" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
	expect(voice.start).not.toHaveBeenCalled();
	voice.isListening = true;
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} />
		</I18nextProvider>,
	);
	expect(onActivity).toHaveBeenLastCalledWith(true);
	expect(screen.getByRole("button", { name: "Stop recording" })).toBeEnabled();
	expect(voice.cancel).not.toHaveBeenCalled();
	view.unmount();
	voice.isListening = false;
});
