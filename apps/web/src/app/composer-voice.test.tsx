// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { Composer } from "./composer.tsx";

const voice = vi.hoisted(() => ({ receive: (_text: string) => {}, finish: vi.fn(), cancel: vi.fn() }));
vi.mock("./use-voice-input.ts", () => ({
	useVoiceInput: () => ({
		isListening: false,
		error: "",
		start: (receive: (text: string) => void) => {
			voice.receive = receive;
		},
		finish: voice.finish,
		cancel: voice.cancel,
	}),
}));
function Frame({ initial, sent }: { initial: string; sent: string[] }) {
	const [draft, setDraft] = useState(initial);
	const current = useRef(initial);
	return (
		<Composer
			recipientName={null}
			draft={draft}
			onDraftChange={(value) => {
				current.current = value;
				setDraft(value);
			}}
			onSend={() => sent.push(current.current)}
			onStop={() => {}}
			streaming={false}
			disabled={false}
			disconnected={false}
			sendOnEnter
		/>
	);
}
function setup(initial = "hello world") {
	const sent: string[] = [];
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<Frame initial={initial} sent={sent} />
		</I18nextProvider>,
	);
	return { input: screen.getByRole("textbox") as HTMLTextAreaElement, sent };
}
function begin(input: HTMLTextAreaElement, start: number, end = start) {
	input.focus();
	input.setSelectionRange(start, end);
	fireEvent.mouseDown(screen.getByRole("button", { name: "Voice input" }));
	fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
}
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

test("replaces selection only after text arrives, revises it, and stops on cursor movement", () => {
	const { input } = setup();
	begin(input, 6, 11);
	expect(input.value).toBe("hello world");
	act(() => voice.receive("你"));
	expect(input.value).toBe("hello 你");
	act(() => voice.receive("你好"));
	expect(input.value).toBe("hello 你好");
	fireEvent.pointerDown(input);
	input.setSelectionRange(0, 0);
	act(() => voice.receive("迟到"));
	expect(input.value).toBe("hello 你好");
	expect(voice.cancel).toHaveBeenCalled();
});

test("send waits for done, then sends the latest inserted text once", async () => {
	let done!: () => void;
	voice.finish.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				done = resolve;
			}),
	);
	const { input, sent } = setup();
	begin(input, 5);
	act(() => voice.receive("!"));
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	act(() => voice.receive("!!"));
	await act(async () => done());
	expect(sent).toEqual(["hello!! world"]);
	act(() => voice.receive("late"));
	expect(input.value).toBe("hello!! world");
});

test("deadline sends displayed text, and editing cancels a pending send", async () => {
	vi.useFakeTimers();
	voice.finish.mockImplementation(() => new Promise<void>(() => {}));
	const { input, sent } = setup();
	begin(input, 5);
	act(() => voice.receive("!"));
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	await act(async () => {
		vi.advanceTimersByTime(2000);
	});
	expect(sent).toEqual(["hello! world"]);
	act(() => voice.receive("late"));
	expect(input.value).toBe("hello! world");
	begin(input, 0);
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	fireEvent.change(input, { target: { value: "edited" } });
	await act(async () => {
		vi.advanceTimersByTime(2000);
	});
	expect(sent).toHaveLength(1);
	expect(input.value).toBe("edited");
});
