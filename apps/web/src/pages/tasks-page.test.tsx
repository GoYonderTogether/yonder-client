// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { Schedule } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TasksList } from "./tasks-page.tsx";

const state = vi.hoisted(() => ({
	schedules: [] as Schedule[],
	loading: false,
	loadError: false,
}));

vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useSchedules: () => ({
		data: state.loading || state.loadError ? undefined : { items: state.schedules },
		isLoading: state.loading,
		isError: state.loadError,
		refetch: async () => {},
	}),
	useItems: () => ({ data: { pages: [] }, isLoading: false, isError: false }),
	useArchivedItems: () => ({ data: undefined, isLoading: false, isError: false, isSuccess: false }),
	useItemListAction: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), reset: vi.fn(), isPending: false }),
	useContacts: () => ({ data: { items: [] } }),
	useGoals: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));

vi.mock("@yonder/ui-shell", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-shell")>()),
	useSidePanel: () => ({ open: vi.fn(), push: vi.fn(), back: vi.fn(), close: vi.fn() }),
}));

const plan: Schedule = {
	id: "sch_1",
	conversationId: "cnv_1",
	title: "每日摘要",
	instruction: "看一下今天的安排",
	action: "task",
	message: null,
	kind: "daily",
	at: "09:00",
	weekdays: [],
	timezone: "Asia/Shanghai",
	status: "active",
	nextRunAt: "2026-11-18T01:00:00.000Z",
	lastRunAt: null,
	lastResult: null,
	createdBy: "user",
	recentRuns: [],
	createdAt: "2026-11-01T00:00:00.000Z",
	version: 1,
	goalId: null,
};

function show(scheduled: boolean, onAddItem: () => void, onAddGoal: () => void) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<TasksList
				scheduled={scheduled}
				onChange={() => {}}
				onOpenItem={() => {}}
				onAddItem={onAddItem}
				onAddGoal={onAddGoal}
			/>
		</I18nextProvider>,
	);
}

test("the goals tab lists a recurring plan under Schedules and keeps a one-off out of it", () => {
	state.schedules = [plan, { ...plan, id: "sch_2", title: "一次性提醒", kind: "once" }];
	show(true, vi.fn(), vi.fn());
	expect(screen.getByText("每日摘要")).toBeVisible();
	expect(screen.queryByText("一次性提醒")).toBeNull();
	expect(screen.getByRole("heading", { name: "Schedules" })).toBeVisible();
});

test("「+」 asks the main Bot with the sentence of the segment on screen", () => {
	const addItem = vi.fn();
	const addGoal = vi.fn();
	const view = show(false, addItem, addGoal);
	fireEvent.click(screen.getByRole("button", { name: "Create" }));
	expect(addItem).toHaveBeenCalledOnce();
	view.unmount();
	show(true, addItem, addGoal);
	fireEvent.click(screen.getByRole("button", { name: "Create" }));
	expect(addGoal).toHaveBeenCalledOnce();
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("the goals tab still renders while the plan list is loading or failed", () => {
	for (const pending of ["loading", "loadError"] as const) {
		state[pending] = true;
		try {
			const view = show(true, vi.fn(), vi.fn());
			expect(screen.getByRole("button", { name: "Create" })).toBeVisible();
			view.unmount();
		} finally {
			state[pending] = false;
		}
	}
});
