// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { Composer } from "./composer.tsx";

vi.mock("./voice-control.tsx", () => ({ VoiceControl: () => null }));
vi.mock("./use-voice-input.ts", () => ({ useVoiceInput: () => ({ isListening: false, error: "", cancel: vi.fn() }) }));

test.each([false, true])("own Bot attachment menu opens before a picker (mobile=%s)", (mobilePicker) => {
	const meeting = vi.fn();
	const picker = vi.spyOn(HTMLInputElement.prototype, "click");
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer
				recipientName="Bot"
				draft=""
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
				streaming={false}
				disabled={false}
				disconnected={false}
				sendOnEnter={!mobilePicker}
				mobilePicker={mobilePicker}
				onMeeting={meeting}
			/>
		</I18nextProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Attach" }));
	expect(picker).not.toHaveBeenCalled();
	expect(Boolean(screen.queryByRole("button", { name: "Album" }))).toBe(mobilePicker);
	expect(Boolean(screen.queryByRole("button", { name: "Camera" }))).toBe(mobilePicker);
	const recording = screen.getByRole("button", { name: /record/i });
	expect(recording).toHaveAccessibleName("Recording notes");
	fireEvent.click(recording);
	expect(meeting).toHaveBeenCalledOnce();
	expect(picker).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Attach" }));
	fireEvent.click(screen.getByRole("button", { name: "Upload files" }));
	expect(picker).toHaveBeenCalledOnce();
	picker.mockRestore();
});

test("mobile swaps the empty composer between typing and holding to talk", async () => {
	const send = vi.fn();
	const props = {
		recipientName: "Bot",
		onDraftChange: vi.fn(),
		onSend: send,
		onSendVoice: vi.fn().mockResolvedValue(undefined),
		streaming: false,
		disabled: false,
		disconnected: false,
		sendOnEnter: false,
		mobilePicker: true,
	};
	const i18n = createI18n("en");
	const composer = (draft: string) => (
		<I18nextProvider i18n={i18n}>
			<Composer {...props} draft={draft} />
		</I18nextProvider>
	);
	const view = render(composer(""));
	expect(screen.getByRole("textbox")).not.toHaveAttribute("placeholder");
	expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
	expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
	await waitFor(() => expect(screen.getByRole("button", { name: "Hold to talk" })).toBeEnabled());
	fireEvent.click(screen.getByRole("button", { name: "Text input" }));
	expect(screen.getByRole("textbox")).toHaveFocus();
	view.rerender(composer("A message"));
	const toggle = screen.getByRole("button", { name: "Voice input" });
	const attach = screen.getByRole("button", { name: "Attach" });
	const sendButton = screen.getByRole("button", { name: "Send" });
	expect(toggle.compareDocumentPosition(screen.getByRole("textbox"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	expect(sendButton.compareDocumentPosition(attach)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	fireEvent.click(toggle);
	await waitFor(() => expect(screen.getByRole("button", { name: "Hold to talk" })).toBeEnabled());
	expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Text input" }));
	expect(screen.getByRole("textbox")).toHaveValue("A message");
	fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
	expect(send).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	expect(send).toHaveBeenCalledOnce();
});

test("desktop Enter sends, while Shift, composition and mobile Enter do not", () => {
	const send = vi.fn();
	const props = {
		recipientName: null,
		draft: "hello",
		onDraftChange: vi.fn(),
		onSend: send,
		streaming: false,
		disabled: false,
		disconnected: false,
	};
	const renderComposer = (sendOnEnter: boolean) => (
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter={sendOnEnter} />
		</I18nextProvider>
	);
	const view = render(renderComposer(true));
	const input = screen.getByRole("textbox");
	fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
	fireEvent.keyDown(input, { key: "Enter", isComposing: true });
	fireEvent.keyDown(input, { key: "Enter", repeat: true });
	expect(send).not.toHaveBeenCalled();
	fireEvent.keyDown(input, { key: "Enter" });
	expect(send).toHaveBeenCalledTimes(1);
	view.rerender(renderComposer(false));
	fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
	expect(send).toHaveBeenCalledTimes(1);
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	expect(send).toHaveBeenCalledTimes(2);
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter streaming />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter streaming disconnected />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("status")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter disconnected disabled />
		</I18nextProvider>,
	);
	expect(screen.queryByRole("status")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("IME keyCode 229 and the first 500ms after composition cannot send", () => {
	const send = vi.fn();
	const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer
				recipientName={null}
				draft="中文"
				onDraftChange={vi.fn()}
				onSend={send}
				streaming={false}
				disabled={false}
				disconnected={false}
				sendOnEnter
			/>
		</I18nextProvider>,
	);
	const input = screen.getByRole("textbox");
	fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
	fireEvent.compositionStart(input);
	fireEvent.keyDown(input, { key: "Enter" });
	expect(send).not.toHaveBeenCalled();
	fireEvent.compositionEnd(input);
	clock.mockReturnValue(1499);
	const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
	fireEvent(input, enter);
	expect(enter.defaultPrevented).toBe(true);
	expect(send).not.toHaveBeenCalled();
	clock.mockReturnValue(1500);
	fireEvent.keyDown(input, { key: "Enter" });
	expect(send).toHaveBeenCalledOnce();
	clock.mockRestore();
});

test.each([
	{ draft: " \n ", disabled: false, disconnected: false, streaming: false, blocked: true, label: "Send" },
	{ draft: "draft", disabled: true, disconnected: false, streaming: false, blocked: true, label: "Send" },
	{ draft: "draft", disabled: false, disconnected: true, streaming: false, blocked: true, label: "Send" },
	{ draft: "draft", disabled: false, disconnected: false, streaming: false, blocked: false, label: "Send" },
	{ draft: "draft", disabled: false, disconnected: false, streaming: true, blocked: true, label: "Send" },
	{ draft: "draft", disabled: false, disconnected: true, streaming: true, blocked: true, label: "Send" },
])("composer action gates: $label, draft=$draft, blocked=$blocked", (state) => {
	const send = vi.fn();
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...state} recipientName={null} onDraftChange={vi.fn()} onSend={send} sendOnEnter />
		</I18nextProvider>,
	);
	const button = screen.getByRole("button", { name: state.label });
	expect(button).toHaveProperty("disabled", state.blocked);
	fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
	expect(send).toHaveBeenCalledTimes(state.blocked ? 0 : 1);
	fireEvent.click(button);
	expect(send).toHaveBeenCalledTimes(state.blocked ? 0 : 2);
});

test("native candidate confirmation and newline keys keep their browser default; clicking send restores the editor", () => {
	const props = {
		recipientName: null,
		draft: "first\nsecond",
		onDraftChange: vi.fn(),
		onSend: vi.fn(),
		streaming: false,
		disabled: false,
		disconnected: false,
	};
	const renderComposer = (sendOnEnter: boolean) => (
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter={sendOnEnter} />
		</I18nextProvider>
	);
	const view = render(renderComposer(true));
	const input = screen.getByRole("textbox");
	for (const extra of [{ keyCode: 229 }, { isComposing: true }, { shiftKey: true }]) {
		const key = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...extra });
		fireEvent(input, key);
		expect(key.defaultPrevented).toBe(false);
	}
	view.rerender(renderComposer(false));
	const mobileEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
	fireEvent(input, mobileEnter);
	expect(mobileEnter.defaultPrevented).toBe(false);
	expect(props.onSend).not.toHaveBeenCalled();
	expect(screen.getByRole("textbox")).toBe(input);
	expect(input).toHaveValue("first\nsecond");
	const button = screen.getByRole("button", { name: "Send" });
	button.focus();
	fireEvent.click(button);
	expect(props.onSend).toHaveBeenCalledOnce();
	expect(input).toHaveFocus();
	fireEvent.change(input, { target: { value: "pasted\nparagraph" } });
	expect(props.onDraftChange).toHaveBeenCalledWith("pasted\nparagraph");
});

test("an in-flight send turns the send arrow into a working cancel", () => {
	const send = vi.fn();
	const cancel = vi.fn();
	const props = {
		recipientName: null,
		draft: "hello",
		onDraftChange: vi.fn(),
		onSend: send,
		onCancelSend: cancel,
		streaming: false,
		disabled: false,
		disconnected: false,
		sendOnEnter: true,
	};
	const view = render(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} />
		</I18nextProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	expect(send).toHaveBeenCalledOnce();
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sending />
		</I18nextProvider>,
	);
	const button = screen.getByRole("button", { name: "Cancel sending" });
	expect(button).not.toBeDisabled();
	fireEvent.click(button);
	expect(cancel).toHaveBeenCalledOnce();
	expect(send).toHaveBeenCalledOnce();
	fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
	expect(send).toHaveBeenCalledOnce();
});
