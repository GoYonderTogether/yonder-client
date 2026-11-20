// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TrayPanelView } from "./panel.tsx";

test("the tray distinguishes empty from local work whose conversation is unknown", () => {
	const i18n = createI18n("en");
	const onAction = vi.fn();
	const { rerender } = render(
		<I18nextProvider i18n={i18n}>
			<TrayPanelView activity={[]} onAction={onAction} />
		</I18nextProvider>,
	);
	expect(screen.getByText("No active tasks on this device")).toBeInTheDocument();
	rerender(
		<I18nextProvider i18n={i18n}>
			<TrayPanelView activity={[]} onAction={onAction} unattributed />
		</I18nextProvider>,
	);
	expect(screen.queryByText("No active tasks on this device")).not.toBeInTheDocument();
	expect(screen.getByText("Local task running · Bot and chat unavailable")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Open Yonder" }));
	fireEvent.click(screen.getByRole("button", { name: "Settings" }));
	fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
	fireEvent.click(screen.getByRole("button", { name: "Quit Yonder" }));
	expect(screen.getByRole("alertdialog")).toHaveTextContent("Quitting may interrupt");
	expect(onAction).not.toHaveBeenCalledWith("quit");
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Quit Yonder" }));
	fireEvent.click(screen.getByRole("button", { name: "Quit Yonder" }));
	expect(onAction.mock.calls).toEqual([["open-main"], ["settings"], ["check-updates"], ["quit"]]);
});

test("a changing activity keeps its existing conversation row in the Bot group", () => {
	const i18n = createI18n("en");
	const onAction = vi.fn();
	const renderPanel = (activity: string) => (
		<I18nextProvider i18n={i18n}>
			<TrayPanelView
				activity={[
					{
						botId: "bot-a",
						botName: "Bot A",
						entries: [{ id: "chat-a", conversationTitle: "A work session with a very long title", activity }],
					},
				]}
				onAction={onAction}
			/>
		</I18nextProvider>
	);
	const { rerender } = render(renderPanel("Reading a local file"));
	const row = screen.getByRole("listitem");
	const title = within(row).getByTitle("A work session with a very long title");
	expect(title).toHaveClass("truncate");
	expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Bot A");
	rerender(renderPanel("Searching local files"));
	expect(screen.getByRole("listitem")).toBe(row);
	expect(within(row).getByTitle("Searching local files")).toHaveClass("truncate");
});
