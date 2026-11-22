// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
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
const prepareIosChatMicrophone = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("../lib/ios-chat-microphone.ts", () => ({ prepareIosChatMicrophone }));
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

test("entering mobile voice mode prepares permission, and release during permission never starts capture", async () => {
	const getUserMedia = vi.fn();
	const onSendVoice = vi.fn();
	let grant!: () => void;
	prepareIosChatMicrophone.mockReturnValueOnce(
		new Promise<void>((resolve) => {
			grant = resolve;
		}),
	);
	const mediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
	Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
	vi.stubGlobal(
		"AudioContext",
		class {
			resume = vi.fn().mockResolvedValue(undefined);
			close = vi.fn().mockResolvedValue(undefined);
			audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
		},
	);
	vi.stubGlobal("AudioWorkletNode", class {});
	try {
		render(
			<I18nextProvider i18n={createI18n("en")}>
				<Composer
					recipientName="Bot"
					draft=""
					onDraftChange={vi.fn()}
					onSend={vi.fn()}
					onSendVoice={onSendVoice}
					streaming={false}
					disabled={false}
					disconnected={false}
					sendOnEnter={true}
					mobilePicker
				/>
			</I18nextProvider>,
		);
		expect(prepareIosChatMicrophone).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
		expect(prepareIosChatMicrophone).toHaveBeenCalledTimes(1);
		expect(getUserMedia).not.toHaveBeenCalled();
		const hold = screen.getByRole("button", { name: "Hold to talk" });
		await act(async () => {});
		fireEvent.keyDown(hold, { key: " " });
		expect(hold).toHaveAttribute("data-held", "true");
		fireEvent.keyUp(hold, { key: " " });
		await act(async () => grant());
		expect(hold).not.toHaveAttribute("data-held");
		expect(getUserMedia).not.toHaveBeenCalled();
		expect(onSendVoice).not.toHaveBeenCalled();
	} finally {
		if (mediaDevices) Object.defineProperty(navigator, "mediaDevices", mediaDevices);
		else Reflect.deleteProperty(navigator, "mediaDevices");
		vi.unstubAllGlobals();
	}
});
