// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { AppNoticeProvider, useAppNotice, useReconnectNotice } from "./app-notice.tsx";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function Controls() {
	const notify = useAppNotice();
	return (
		<>
			<button type="button" onClick={() => notify({ key: "a", text: "Interruption", tone: "error" })}>
				Show error
			</button>
			<button type="button" onClick={() => notify({ key: "b", text: "Minor message" })}>
				Show info
			</button>
		</>
	);
}

function Chat({ disconnected, active }: { disconnected: boolean; active: boolean }) {
	useReconnectNotice(disconnected, active, "person");
	return null;
}

test("the notice preserves focus, shows one severity, expires, and clears on account changes", () => {
	vi.useFakeTimers();
	const tree = (scope: string) => (
		<AppNoticeProvider scope={scope}>
			<Controls />
		</AppNoticeProvider>
	);
	const { rerender } = render(tree("first"));
	const error = screen.getByRole("button", { name: "Show error" });
	error.focus();
	fireEvent.click(error);
	const status = screen.getByRole("status");
	expect(status).toHaveTextContent("Interruption");
	expect(error).toHaveFocus();
	act(() => vi.advanceTimersByTime(4000));
	fireEvent.click(error);
	fireEvent.click(screen.getByRole("button", { name: "Show info" }));
	expect(status).not.toHaveTextContent("Minor message");
	act(() => vi.advanceTimersByTime(500));
	expect(status).toBeEmptyDOMElement();
	fireEvent.click(error);
	rerender(tree("second"));
	expect(status).toBeEmptyDOMElement();
});

test("realtime notices skip brief disconnects, hide at recovery, and appear only once per outage", () => {
	vi.useFakeTimers();
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	const i18n = createI18n("en");
	const tree = (disconnected: boolean, active = true) => (
		<I18nextProvider i18n={i18n}>
			<AppNoticeProvider scope="person">
				<Chat disconnected={disconnected} active={active} />
			</AppNoticeProvider>
		</I18nextProvider>
	);
	const { rerender } = render(tree(true));
	const notice = screen.getByRole("status");
	act(() => vi.advanceTimersByTime(1500));
	rerender(tree(false));
	act(() => vi.advanceTimersByTime(3000));
	expect(notice).toBeEmptyDOMElement();
	rerender(tree(true, false));
	act(() => vi.advanceTimersByTime(3000));
	expect(notice).toBeEmptyDOMElement();
	rerender(tree(true));
	act(() => vi.advanceTimersByTime(3000));
	expect(notice).toHaveTextContent("Connection lost. Reconnecting.");
	act(() => vi.advanceTimersByTime(4500));
	rerender(tree(true, false));
	rerender(tree(true));
	act(() => vi.advanceTimersByTime(3000));
	expect(notice).toBeEmptyDOMElement();
	rerender(tree(false));
	rerender(tree(true));
	act(() => vi.advanceTimersByTime(3000));
	expect(notice).toHaveTextContent("Connection lost. Reconnecting.");
	rerender(tree(false));
	expect(notice).toBeEmptyDOMElement();
});
