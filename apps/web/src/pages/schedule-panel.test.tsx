// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ApiError } from "@yonder/api-client";
import type { Schedule } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { SchedulePanel } from "./schedule-panel.tsx";

const state = vi.hoisted(() => ({
	schedules: [] as Schedule[],
	pause: vi.fn(),
	resume: vi.fn(),
	remove: vi.fn(),
	failure: null as Error | null,
}));
function mutation(action: "pause" | "resume" | "remove") {
	return {
		mutate: (id: string) => void state[action](id),
		isPending: false,
		isError: state.failure !== null && action === "pause",
		error: action === "pause" ? state.failure : null,
	};
}
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useSchedules: () => ({ data: { items: state.schedules }, isError: false }),
	useScheduleActions: () => ({ pause: mutation("pause"), resume: mutation("resume"), remove: mutation("remove") }),
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
			<SchedulePanel scheduleId={plan.id} />
		</I18nextProvider>,
	);
}

beforeEach(() => {
	state.schedules = [plan];
	state.failure = null;
	state.pause.mockReset();
	state.remove.mockReset();
});

test("shows the plan and its recent runs, and pauses from the menu", () => {
	show();
	expect(screen.getByRole("heading", { name: "Recent runs" })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }));
	expect(state.pause).toHaveBeenCalledWith("sch_1");
});

test("deleting asks first", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
	expect(state.remove).not.toHaveBeenCalled();
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
	expect(state.remove).toHaveBeenCalledWith("sch_1");
});

test("a refused action says the server's real reason", () => {
	state.failure = new ApiError({ code: "rate_limited", status: 429, message: "rate_limited" });
	show();
	expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts. Try again later.");
});
