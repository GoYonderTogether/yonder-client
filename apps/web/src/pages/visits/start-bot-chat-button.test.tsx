// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { StartBotChatButton } from "./start-bot-chat-button.tsx";

const start = vi.hoisted(() => ({ mutate: vi.fn() }));
const state = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock("@yonder/ui-data", async (original) => ({
	...(await original<typeof import("@yonder/ui-data")>()),
	useStartBotChat: () => ({ mutate: start.mutate, isPending: false, error: state.error }),
}));
const localised = (child: ReactNode) => <I18nextProvider i18n={createI18n("en")}>{child}</I18nextProvider>;
beforeEach(() => {
	vi.clearAllMocks();
	state.error = undefined;
});

test("starting a chat hands the server's conversation to the page that placed the button", () => {
	const onOpen = vi.fn();
	render(localised(<StartBotChatButton handle="someone_else" onOpen={onOpen} />));
	fireEvent.click(screen.getByRole("button", { name: "Start chat" }));
	expect(start.mutate).toHaveBeenCalledWith("someone_else", expect.anything());
	start.mutate.mock.calls[0]?.[1].onSuccess({ conversation: { id: "conversation-new" } });
	expect(onOpen).toHaveBeenCalledWith("conversation-new");
});

test("a failed start shows the server's reason instead of nothing happening", () => {
	state.error = new ApiError({ code: "not_found", status: 404, message: "no such handle" });
	render(localised(<StartBotChatButton handle="missing" onOpen={vi.fn()} />));
	expect(screen.getByRole("alert")).toHaveTextContent("Not found.");
});
