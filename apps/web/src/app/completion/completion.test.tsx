// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { Composer } from "../composer.tsx";
import type { CompletionItem } from "./tokens.ts";

vi.mock("../use-voice-input.ts", () => ({
	useVoiceInput: () => ({ isListening: false, error: "", cancel() {}, start() {}, finish: async () => {} }),
}));
const items: CompletionItem[] = [
	...Array.from(
		{ length: 6 },
		(_, i): CompletionItem => ({
			id: `s${i}`,
			kind: "skill",
			name: `pdf-${i}`,
			description: `PDF workflow ${i}`,
			source: "platform",
		}),
	),
	{ id: "member", kind: "member", name: "Alex Doe", description: "@alex", memberKind: "person" },
	{ id: "command:compact", kind: "command", name: "compact", description: "Compact context" },
];

function CompletionFrame({
	initial,
	scope,
	accepted,
	sent,
	manage,
}: {
	initial: string;
	scope: string;
	accepted: (marker: unknown) => void;
	sent: (text: string) => void;
	manage: () => void;
}) {
	const [text, setText] = useState(initial);
	return (
		<Composer
			recipientName={null}
			scope={scope}
			draft={text}
			onDraftChange={setText}
			onSend={() => sent(text)}
			onStop={() => {}}
			streaming={false}
			disabled={false}
			disconnected={false}
			sendOnEnter
			completionItems={items}
			onAcceptCompletion={(next, marker) => {
				accepted(marker);
				setText(next);
			}}
			onCompact={manage}
		/>
	);
}

function setup(initial = "", scope = "one") {
	const accepted = vi.fn();
	const sent = vi.fn();
	const manage = vi.fn();

	const element = (scope: string) => (
		<I18nextProvider i18n={createI18n("en")}>
			<CompletionFrame initial={initial} scope={scope} accepted={accepted} sent={sent} manage={manage} />
		</I18nextProvider>
	);
	const view = render(element(scope));
	const input = screen.getByRole("textbox") as HTMLTextAreaElement;
	input.focus();
	const type = (text: string, caret = text.length) => {
		fireEvent.change(input, { target: { value: text, selectionStart: caret, selectionEnd: caret } });
	};
	return { input, type, accepted, sent, manage, changeScope: (scope: string) => view.rerender(element(scope)) };
}

test.each(["Enter", "Tab"])("%s replaces only the active skill token and keeps the caret", async (key) => {
	const { input, type, accepted, sent } = setup();
	expect(screen.queryByRole("listbox")).toBeNull();
	expect(screen.queryByText("Compact context")).toBeNull();
	type("before /pdf-2 after", 13);
	expect(input.value).toBe("before /pdf-2 after");
	expect(screen.getAllByRole("option")).toHaveLength(1);
	fireEvent.keyDown(input, { key });
	await waitFor(() => expect(input.selectionStart).toBe(13));
	expect(input.value).toBe("before /pdf-2 after");
	expect(accepted).toHaveBeenCalledWith({ id: "s2", kind: "skill", marker: "/pdf-2", start: 7, end: 13 });
	expect(sent).not.toHaveBeenCalled();
	expect(input).toHaveFocus();
	expect(screen.queryByRole("listbox")).toBeNull();
});

test("paging and active descendants keep focus; edge arrows and Shift+Tab retain native behaviour", () => {
	const { input, type, accepted } = setup();
	type("/");
	expect(screen.getAllByRole("option")).toHaveLength(4);
	fireEvent.keyDown(input, { key: "PageDown" });
	expect(screen.getByText("2 / 2")).toBeVisible();
	expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0]?.id);
	const edge = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
	fireEvent(input, edge);
	expect(edge.defaultPrevented).toBe(false);
	const backwards = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
	fireEvent(input, backwards);
	expect(backwards.defaultPrevented).toBe(false);
	for (const modifier of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
		const editing = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true, ...modifier });
		fireEvent(input, editing);
		expect(editing.defaultPrevented).toBe(false);
		expect(input).toHaveValue("/");
	}
	fireEvent.keyDown(input, { key: "ArrowUp" });
	fireEvent.keyDown(input, { key: "Tab" });
	expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ id: "s3" }));
	expect(input).toHaveFocus();
});

test("IME final change before compositionEnd restores the correct filter without selecting", () => {
	const { input, type, accepted, sent } = setup();
	type("/");
	fireEvent.compositionStart(input);
	type("/pdf-3");
	expect(screen.queryByRole("listbox")).toBeNull();
	const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
	fireEvent(input, tab);
	expect(tab.defaultPrevented).toBe(false);
	fireEvent.compositionEnd(input);
	expect(screen.getAllByRole("option")).toHaveLength(1);
	fireEvent.keyDown(input, { key: "Enter" });
	expect(input).toHaveValue("/pdf-3");
	expect(accepted).not.toHaveBeenCalled();
	expect(sent).not.toHaveBeenCalled();
});

test("dismissed and unmatched text sends normally; dismissal and selection do not rewrite it", () => {
	const { input, type, accepted, sent } = setup();
	type("/pdf");
	fireEvent.keyDown(input, { key: "Escape" });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(sent).toHaveBeenLastCalledWith("/pdf");
	expect(accepted).not.toHaveBeenCalled();
	type("/unknown");
	const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
	fireEvent(input, tab);
	expect(tab.defaultPrevented).toBe(false);
	fireEvent.keyDown(input, { key: "Enter" });
	expect(sent).toHaveBeenLastCalledWith("/unknown");
	fireEvent.keyDown(input, { key: "Escape" });
	expect(screen.queryByRole("listbox")).toBeNull();
	fireEvent.select(input);
	expect(screen.queryByRole("listbox")).toBeNull();
	type("");
	type("/");
	expect(screen.getByRole("listbox")).toBeVisible();
	type("/pdf-");
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("listbox")).toBeNull();
	type("/pdf-0");
	fireEvent.select(input, { target: { selectionStart: 0, selectionEnd: 6 } });
	expect(screen.queryByRole("listbox")).toBeNull();
});

test("at only offers real members; clicking inserts a spaced display name, commands require confirmation", () => {
	const { input, type, accepted, manage } = setup();
	type("@");
	expect(screen.getAllByRole("option")).toHaveLength(1);
	fireEvent.pointerDown(screen.getByRole("option"));
	fireEvent.click(screen.getByRole("option"));
	expect(input).toHaveValue("@Alex Doe ");
	expect(accepted).toHaveBeenCalledWith({ id: "member", kind: "member", marker: "@Alex Doe", start: 0, end: 9 });
	type("before /compact after", 15);
	expect(manage).not.toHaveBeenCalled();
	fireEvent.keyDown(input, { key: "Enter" });
	expect(manage).toHaveBeenCalledOnce();
	expect(input).toHaveValue("before  after");
});
