// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { Composer } from "./composer.tsx";

test("desktop Enter sends, while Shift, composition and mobile Enter do not", () => {
	const send = vi.fn();
	const props = {
		recipientName: null,
		draft: "hello",
		onDraftChange: vi.fn(),
		onSend: send,
		onStop: vi.fn(),
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
	fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
	expect(props.onStop).toHaveBeenCalledTimes(1);
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter streaming disconnected />
		</I18nextProvider>,
	);
	expect(screen.getByRole("status")).toHaveTextContent("response status is unknown");
	expect(screen.getByRole("button", { name: "Stop generating" })).toBeDisabled();
	view.rerender(
		<I18nextProvider i18n={createI18n("en")}>
			<Composer {...props} sendOnEnter disconnected disabled />
		</I18nextProvider>,
	);
	expect(screen.getByRole("status")).toHaveTextContent("Connection lost. Reconnecting.");
	expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});
