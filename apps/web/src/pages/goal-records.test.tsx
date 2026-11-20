// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Goal } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { GoalRecords } from "./goal-records.tsx";

const model = vi.hoisted(() => ({
	goals: [] as Goal[],
	onboardingDisabled: false,
	mutate: vi.fn(),
	transfer: vi.fn(),
}));
vi.mock("@yonder/ui-data", () => ({
	useGoals: () => ({ data: { items: model.goals, onboarding: { version: 1, disabled: model.onboardingDisabled } } }),
	useChangeGoal: () => ({ mutate: model.mutate, isPending: false, isError: false }),
	useGoalSettings: () => ({ transfer: { mutate: model.transfer } }),
	useContacts: () => ({ data: { items: [] } }),
	usePerson: () => ({ id: "owner" }),
	ownedBots: () => [{ id: "research", displayName: "Research Bot" }],
}));

test("renders confirmed goals independently of tracking and supports explicit changes", () => {
	const goal: Goal = {
		id: "goal-release",
		botId: "bot",
		conversationId: "conversation",
		title: "Release",
		outcome: "Ship safely",
		progress: null,
		nextStep: "Run the checks",
		state: "proposed",
		system: null,
		changedAt: "2026-11-18T00:00:00Z",
	};
	model.goals = [goal];
	const i18n = createI18n("en");
	const content = () => (
		<I18nextProvider i18n={i18n}>
			<GoalRecords />
		</I18nextProvider>
	);
	const view = render(content());
	fireEvent.click(screen.getByRole("button", { name: "Confirm goal" }));
	expect(model.mutate).toHaveBeenLastCalledWith({ id: goal.id, action: "confirm" });
	model.goals = [
		{ ...goal, state: "active" },
		{
			...goal,
			id: "system",
			title: "Get started",
			state: "active",
			system: "onboarding",
			milestones: { wrote: true, connected: false, planned: false },
		},
	];
	view.rerender(content());
	fireEvent.change(screen.getByRole("combobox", { name: "Receiving Bot" }), { target: { value: "research" } });
	fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
	expect(model.transfer).toHaveBeenCalledWith({ id: goal.id, botId: "research" });
	expect(
		within(screen.getAllByRole("listitem")[1] as HTMLElement).queryByRole("button", { name: "Mark achieved" }),
	).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Update progress" }));
	fireEvent.change(screen.getByRole("textbox", { name: "Progress" }), { target: { value: "Checks passed" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(model.mutate).toHaveBeenLastCalledWith(
		{ id: goal.id, action: "progress", progress: "Checks passed", nextStep: "Run the checks" },
		expect.any(Object),
	);
});

test.each([false, true])("shows the goal empty state without onboarding controls (disabled: %s)", (disabled) => {
	model.goals = [];
	model.onboardingDisabled = disabled;
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<GoalRecords />
		</I18nextProvider>,
	);
	expect(screen.queryByText(/onboarding tips/i)).toBeNull();
	const heading = screen.getByRole("heading", { name: "No goals yet" });
	expect(heading.closest("li")?.querySelector('[aria-hidden="true"] svg')).toBeInstanceOf(SVGElement);
});
