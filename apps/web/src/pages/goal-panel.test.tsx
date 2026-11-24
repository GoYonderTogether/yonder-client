// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Goal } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { AskMainBotProvider } from "../app/ask-main-bot.tsx";
import { GoalPanel } from "./goal-panel.tsx";

const model = vi.hoisted(() => ({
	goals: [] as Goal[],
	change: vi.fn(),
	remove: vi.fn(),
	close: vi.fn(),
	ask: vi.fn(),
}));
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useGoals: () => ({ data: { items: model.goals }, isError: false }),
	useSchedules: () => ({ data: { items: [] }, refetch: async () => {} }),
	useChangeGoal: () => ({ mutate: model.change, isPending: false, error: null }),
	useRemoveGoal: () => ({ mutate: model.remove, isPending: false, error: null }),
}));
vi.mock("@yonder/ui-shell", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-shell")>()),
	useSidePanel: () => ({ open: vi.fn(), push: vi.fn(), back: vi.fn(), close: model.close }),
}));

const goal: Goal = {
	id: "goal_events",
	botId: "bot",
	conversationId: "cnv",
	title: "关注武汉 AI 活动",
	outcome: "每周知道有哪些活动",
	progress: "找到了两场",
	nextStep: "周五再看一次",
	state: "active",
	system: null,
	changedAt: "2026-11-20T00:00:00Z",
};

function show() {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<AskMainBotProvider value={model.ask}>
				<GoalPanel goalId={goal.id} />
			</AskMainBotProvider>
		</I18nextProvider>,
	);
}

function menu(names: string[]) {
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	return names.map((name) => screen.getByRole("menuitem", { name }));
}

beforeEach(() => {
	for (const fn of [model.change, model.remove, model.close, model.ask]) fn.mockReset();
});

test("a proposed goal is confirmed or declined with two buttons and has no menu", () => {
	model.goals = [{ ...goal, state: "proposed" }];
	show();
	expect(screen.queryByRole("button", { name: "More" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Confirm goal" }));
	expect(model.change).toHaveBeenLastCalledWith({ id: goal.id, action: "confirm" }, expect.any(Object));
	fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
	expect(model.change).toHaveBeenLastCalledWith({ id: goal.id, action: "stop" }, expect.any(Object));
});

test("an active goal offers exactly mark done, edit and delete", () => {
	model.goals = [goal];
	show();
	expect(screen.getByText("找到了两场")).toBeVisible();
	expect(screen.getByText("周五再看一次")).toBeVisible();
	const items = menu(["Mark done", "Edit", "Delete"]);
	expect(screen.getAllByRole("menuitem")).toHaveLength(3);
	fireEvent.click(items[0] as HTMLElement);
	expect(model.change).toHaveBeenLastCalledWith({ id: goal.id, action: "complete" }, expect.any(Object));
});

test("edit puts one sentence in the main Bot's draft — no form opens", () => {
	model.goals = [goal];
	show();
	menu([]);
	fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
	expect(model.ask).toHaveBeenCalledWith("Change the goal 「关注武汉 AI 活动」 to: ");
	expect(screen.queryByRole("textbox")).toBeNull();
});

test("delete asks once, then deletes the goal and closes its panel", () => {
	model.goals = [goal];
	show();
	menu([]);
	fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
	expect(model.remove).not.toHaveBeenCalled();
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
	expect(model.remove).toHaveBeenCalledWith(goal.id, expect.any(Object));
});

test("a finished goal still offers edit and delete, but not mark done", () => {
	model.goals = [{ ...goal, state: "achieved" }];
	show();
	menu([]);
	expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Delete"]);
});

test("pause, resume, stop and hand-off are no longer app controls", () => {
	model.goals = [{ ...goal, state: "paused" }];
	show();
	menu([]);
	for (const name of ["Pause", "Resume", "Stop", "Transfer"]) {
		expect(screen.queryByRole("menuitem", { name })).toBeNull();
	}
	// The transfer history the Bot recorded still reads.
	expect(screen.getByRole("button", { name: "More" })).toBeVisible();
});
