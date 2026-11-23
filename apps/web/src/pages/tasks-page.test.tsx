// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { Schedule } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { TasksList } from "./tasks-page.tsx";

/** The goals tab's list and the inline schedule form; a plan's own actions are in its side panel. */
const state = vi.hoisted(() => ({
	schedules: [] as Schedule[],
	loading: false,
	loadError: false,
	pause: vi.fn(),
	resume: vi.fn(),
	remove: vi.fn(),
	failure: null as Error | null,
}));

/**
 * `mutate` never throws: a refusal lands in the mutation's own error state, which is what the page
 * reads. The test sets `state.failure` before the click and the page re-renders from it afterwards.
 */
function mutation(action: "pause" | "resume" | "remove") {
	return {
		mutate: (id: string) => void state[action](id),
		isPending: false,
		isError: state.failure !== null,
		error: state.failure,
	};
}

vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useSchedules: () => ({
		data: state.loading || state.loadError ? undefined : { items: state.schedules },
		isLoading: state.loading,
		isError: state.loadError,
		refetch: async () => {},
	}),
	useScheduleActions: () => ({
		create: mutation("pause"),
		update: mutation("pause"),
		pause: mutation("pause"),
		resume: mutation("resume"),
		remove: mutation("remove"),
	}),
	useItems: () => ({ data: { pages: [] }, isLoading: false, isError: false }),
	useContacts: () => ({ data: { items: [] } }),
	useGoals: () => ({ data: { items: [] }, isLoading: false, isError: false }),
	useChangeGoal: () => ({ mutate: vi.fn(), isPending: false }),
	useGoalSettings: () => ({ transfer: { isPending: false } }),
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

function show() {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<TasksList
				scheduled
				onChange={() => {}}
				onOpenItem={() => {}}
				onAdd={() => {}}
				onSchedule={() => {}}
				showManualSchedule
			/>
		</I18nextProvider>,
	);
}

test("the goals tab lists a recurring plan under Schedules and keeps a one-off out of it", () => {
	state.schedules = [plan, { ...plan, id: "sch_2", title: "一次性提醒", kind: "once" }];
	state.failure = null;
	show();
	expect(screen.getByText("每日摘要")).toBeVisible();
	expect(screen.queryByText("一次性提醒")).toBeNull();
	expect(screen.getByRole("heading", { name: "Schedules" })).toBeVisible();
});

for (const pending of ["loading", "loadError"] as const) {
	test(`schedule creation remains usable while the list is ${pending}`, () => {
		state[pending] = true;
		try {
			show();
			fireEvent.click(screen.getByRole("button", { name: "Create" }));
			fireEvent.click(screen.getByRole("menuitem", { name: "Create scheduled task manually" }));
			expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
			expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
		} finally {
			state[pending] = false;
		}
	});
}
