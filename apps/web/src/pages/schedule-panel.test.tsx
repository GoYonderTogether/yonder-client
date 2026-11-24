// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "@yonder/api-client";
import type { Schedule } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { AskMainBotProvider } from "../app/ask-main-bot.tsx";
import { SchedulePanel } from "./schedule-panel.tsx";

const state = vi.hoisted(() => ({
	schedules: [] as Schedule[],
	remove: vi.fn((_id: string, _options?: unknown) => {}),
	close: vi.fn(),
	ask: vi.fn(),
	failure: null as Error | null,
}));
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useSchedules: () => ({ data: { items: state.schedules }, isError: false }),
	useScheduleActions: () => ({
		remove: {
			mutate: (id: string) => void state.remove(id),
			isPending: false,
			isError: state.failure !== null,
			error: state.failure,
		},
	}),
}));
vi.mock("@yonder/ui-shell", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-shell")>()),
	useSidePanel: () => ({ open: vi.fn(), push: vi.fn(), back: vi.fn(), close: state.close }),
}));

const plan: Schedule = {
	id: "sch_1",
	conversationId: "cnv",
	title: "每日摘要",
	instruction: "看一下今天的安排",
	action: "task",
	message: null,
	kind: "daily",
	at: "09:00",
	weekdays: [],
	timezone: "Asia/Shanghai",
	status: "active",
	nextRunAt: "2026-11-24T01:00:00.000Z",
	lastRunAt: "2026-11-23T01:00:00.000Z",
	lastResult: "reported",
	createdBy: "user",
	recentRuns: [
		{
			id: "run_1",
			scheduledFor: "2026-11-23T01:00:00.000Z",
			startedAt: "2026-11-23T01:00:01.000Z",
			result: "reported",
		} as Schedule["recentRuns"][number],
	],
	createdAt: "2026-11-01T00:00:00.000Z",
	version: 1,
	goalId: null,
};

function show() {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<AskMainBotProvider value={state.ask}>
				<SchedulePanel scheduleId={plan.id} />
			</AskMainBotProvider>
		</I18nextProvider>,
	);
}

beforeEach(() => {
	state.schedules = [plan];
	state.failure = null;
	for (const fn of [state.remove, state.close, state.ask]) fn.mockClear();
});

test("the menu is only edit and delete, and edit fills the main Bot draft", () => {
	show();
	expect(screen.getByRole("heading", { name: "Recent runs" })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Delete"]);
	fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
	expect(state.ask).toHaveBeenCalledWith("Change the scheduled task 「每日摘要」 to: ");
});

test("deleting asks first", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
	expect(state.remove).not.toHaveBeenCalled();
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
	expect(state.remove).toHaveBeenCalledWith(plan.id);
});

test("a paused plan says so in one word, with no pause or resume control", () => {
	state.schedules = [{ ...plan, status: "paused" }];
	show();
	expect(screen.getByText("Paused")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	for (const name of ["Pause", "Resume"]) expect(screen.queryByRole("menuitem", { name })).toBeNull();
});

test("a refused delete says the server's real reason", () => {
	state.failure = new ApiError({ code: "rate_limited", status: 429, message: "rate_limited" });
	show();
	expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again later.");
});
