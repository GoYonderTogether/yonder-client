// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Goal, Schedule } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { GoalsTab } from "./goal-records.tsx";

const model = vi.hoisted(() => ({
	goals: [] as Goal[],
	schedules: [] as Schedule[],
	open: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useGoals: () => ({ data: { items: model.goals }, isLoading: false, isError: false, refetch: async () => {} }),
	useSchedules: () => ({ data: { items: model.schedules }, isLoading: false, isError: false, refetch: async () => {} }),
}));
vi.mock("@yonder/ui-shell", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-shell")>()),
	useSidePanel: () => ({ open: model.open, push: vi.fn(), back: vi.fn(), close: vi.fn() }),
}));

const goal: Goal = {
	id: "goal_events",
	botId: "bot",
	conversationId: "cnv",
	title: "关注武汉 AI 活动",
	outcome: "每周知道有哪些活动",
	progress: null,
	nextStep: null,
	state: "active",
	system: null,
	changedAt: "2026-11-20T00:00:00Z",
};
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
	lastRunAt: null,
	lastResult: null,
	createdBy: "user",
	recentRuns: [],
	createdAt: "2026-11-01T00:00:00.000Z",
	version: 1,
	goalId: null,
};

/** A group is its heading's section. */
function group(name: string) {
	return screen.getByRole("heading", { name }).closest("section") as HTMLElement;
}

function show(creating = false) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<GoalsTab creating={creating} />
		</I18nextProvider>,
	);
}

beforeEach(() => {
	model.goals = [];
	model.schedules = [];
	model.open.mockReset();
});

test("groups live goals, unowned plans and folded finished goals, and hides the system goal", () => {
	model.goals = [
		goal,
		{ ...goal, id: "goal_hire", title: "招第一位工程师", state: "proposed" },
		{ ...goal, id: "goal_sys", title: "Get started", system: "onboarding" },
		{ ...goal, id: "goal_done", title: "完成种子轮", state: "achieved" },
	];
	model.schedules = [plan, { ...plan, id: "sch_watch", title: "看活动", goalId: "goal_events" }];
	show();
	const active = group("Active");
	const rows = within(active).getAllByRole("button");
	// A goal waiting for the owner comes first and says so.
	expect(rows[0]).toHaveTextContent("招第一位工程师");
	expect(rows[0]).toHaveTextContent("Needs confirmation");
	expect(rows[1]).toHaveTextContent("关注武汉 AI 活动");
	expect(rows[1]).toHaveTextContent("Next check");
	expect(screen.queryByText("Get started")).toBeNull();
	const schedules = group("Schedules");
	expect(within(schedules).getByText("每日摘要")).toBeVisible();
	// The goal's own check belongs to the goal, not to the unowned plans.
	expect(within(schedules).queryByText("看活动")).toBeNull();
	expect(screen.queryByText("完成种子轮")).toBeNull();
	const done = screen.getByRole("button", { name: "Done (1)" });
	expect(done).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(done);
	expect(screen.getByText("完成种子轮")).toBeVisible();
});

test("a row opens its goal or plan in the side panel", () => {
	model.goals = [goal];
	model.schedules = [plan];
	show();
	fireEvent.click(screen.getByRole("button", { name: /关注武汉 AI 活动/ }));
	expect(model.open).toHaveBeenLastCalledWith(expect.objectContaining({ key: "goal:goal_events", title: goal.title }));
	fireEvent.click(screen.getByRole("button", { name: /每日摘要/ }));
	expect(model.open).toHaveBeenLastCalledWith(expect.objectContaining({ key: "schedule:sch_1", title: plan.title }));
});

test("shows the empty state only when there is nothing live and no unowned plan", () => {
	model.goals = [{ ...goal, state: "stopped" }];
	const view = show();
	expect(screen.getByRole("heading", { name: "No goals yet" })).toBeVisible();
	view.unmount();
	show(true);
	expect(screen.queryByRole("heading", { name: "No goals yet" })).toBeNull();
});
