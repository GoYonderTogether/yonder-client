// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Goal } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";
import { GoalPanel } from "./goal-panel.tsx";

const model = vi.hoisted(() => ({ goals: [] as Goal[], mutate: vi.fn() }));
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useGoals: () => ({ data: { items: model.goals }, isError: false }),
	useSchedules: () => ({ data: { items: [] }, refetch: async () => {} }),
	useChangeGoal: () => ({ mutate: model.mutate, isPending: false, error: null }),
	useGoalSettings: () => ({ transfer: { mutate: vi.fn(), isPending: false, error: null } }),
	useContacts: () => ({ data: { items: [] } }),
	usePerson: () => ({ id: "owner" }),
	ownedBots: () => [],
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
			<GoalPanel goalId={goal.id} />
		</I18nextProvider>,
	);
}

beforeEach(() => model.mutate.mockReset());

test("a proposed goal is confirmed or declined with two buttons and has no menu", () => {
	model.goals = [{ ...goal, state: "proposed" }];
	show();
	expect(screen.queryByRole("button", { name: "More" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Confirm goal" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "confirm" }, expect.any(Object));
	fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "stop" }, expect.any(Object));
});

test("the menu pauses and completes a live goal, and stopping asks first", () => {
	model.goals = [goal];
	show();
	expect(screen.getByText("找到了两场")).toBeVisible();
	expect(screen.getByText("周五再看一次")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "pause" }, expect.any(Object));
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Mark achieved" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "complete" }, expect.any(Object));
	model.mutate.mockReset();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Stop" }));
	expect(model.mutate).not.toHaveBeenCalled();
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Stop" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "stop" }, expect.any(Object));
});

test("a paused goal offers to resume", () => {
	model.goals = [{ ...goal, state: "paused" }];
	show();
	fireEvent.click(screen.getByRole("button", { name: "More" }));
	fireEvent.click(screen.getByRole("menuitem", { name: "Resume" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "resume" }, expect.any(Object));
});
