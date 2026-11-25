// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ItemSummary, Member } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ItemsList } from "./items-list.tsx";

const state = vi.hoisted(() => ({
	items: [] as ItemSummary[],
	archived: [] as ItemSummary[],
	contacts: [] as Member[],
	archivedRequested: [] as boolean[],
	change: vi.fn(async (_request: unknown) => ({ ok: true })),
}));
vi.mock("@yonder/ui-data", async (importOriginal) => ({
	...(await importOriginal<typeof import("@yonder/ui-data")>()),
	useItems: () => ({
		data: { pages: [{ items: state.items, nextCursor: null }] },
		isLoading: false,
		isError: false,
		hasNextPage: false,
		isFetchingNextPage: false,
		fetchNextPage: async () => {},
		refetch: async () => {},
	}),
	useArchivedItems: (enabled: boolean) => {
		state.archivedRequested.push(enabled);
		return {
			data: enabled ? { pages: [{ items: state.archived, nextCursor: null }] } : undefined,
			isLoading: false,
			isError: false,
			isSuccess: enabled,
			hasNextPage: false,
			isFetchingNextPage: false,
			fetchNextPage: async () => {},
			refetch: async () => {},
		};
	},
	useContacts: () => ({ data: { items: state.contacts } }),
	useSchedules: () => ({ data: { items: [] } }),
	useItemListAction: () => ({ mutate: state.change, mutateAsync: state.change, reset: vi.fn() }),
}));

const bot: Member = {
	id: "bot_1",
	kind: "bot",
	handle: "mybot",
	displayName: "我的 Bot",
	avatarUrl: null,
	bio: null,
	ownerId: "person_1",
	isDefault: false,
	createdAt: "2026-11-01T00:00:00Z",
	version: 1,
};

const item = (extra: Partial<ItemSummary>): ItemSummary => ({
	id: "run_1",
	source: "subtask",
	title: "查报销规则",
	state: "running",
	botMemberId: "bot_1",
	conversationId: "cnv_1",
	startedAt: new Date().toISOString(),
	endedAt: null,
	result: null,
	failureReason: null,
	...extra,
});

function show(items: ItemSummary[]) {
	state.items = items;
	state.contacts = [bot];
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<ItemsList onOpen={() => {}} />
		</I18nextProvider>,
	);
}

/** The section headings in the order they are drawn. */
const headings = (container: HTMLElement) =>
	[...container.querySelectorAll("h2")].map((heading) => heading.textContent);

test("需要你 and 进行中 come first and only when they have rows; the rest is by day", () => {
	const now = new Date();
	const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
	const older = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const { container } = show([
		item({ id: "today", title: "今天的事", state: "completed", startedAt: now.toISOString() }),
		item({ id: "waiting", title: "等你确认", state: "waiting_user" }),
		item({ id: "running", title: "在跑的活" }),
		item({ id: "yesterday", title: "昨天的事", state: "failed", failureReason: "idle_timeout", startedAt: yesterday }),
		item({ id: "old", title: "很久以前的事", state: "completed", startedAt: older }),
	]);
	expect(headings(container)).toEqual(["Needs you", "Active", "Today", "Yesterday", "Earlier"]);

	// The two live sections are gone entirely when nothing is in them.
	const done = show([item({ id: "done", title: "做完的事", state: "completed" })]);
	expect(headings(done.container)).toEqual(["Today"]);
	// 进行中 without 需要你 leaves only the one live section, and a running row is not repeated by day.
	const runningOnly = show([item({ id: "run", title: "在跑的活" })]);
	expect(headings(runningOnly.container)).toEqual(["Active"]);
});

test("a row is a title and one caption: how it came to be, which Bot, and the time", () => {
	show([
		item({ id: "meeting", source: "meeting", title: "周会纪要", state: "completed", endedAt: "2026-11-17T02:30:00Z" }),
		item({ id: "chat", source: "conversation", title: "整理账单", state: "completed" }),
		item({ id: "sub", title: "查报销规则", state: "completed" }),
	]);
	const row = screen.getByText("周会纪要").closest("li") as HTMLElement;
	expect(row.textContent).toContain("Recording·我的 Bot");
	expect(screen.getByText("整理账单").closest("li")?.textContent).toContain("Chat·我的 Bot");
	expect(screen.getByText("查报销规则").closest("li")?.textContent).toContain("Bot task·我的 Bot");
	// One line only: the outcome is not repeated in the list.
	expect(screen.queryByText("纪要已发到对话里。")).toBeNull();
});

test("each state is a mark with its own word, and only the waiting row is highlighted", () => {
	show([
		item({ id: "running", title: "在跑的活" }),
		item({ id: "waiting", title: "等你确认", state: "waiting_user" }),
		item({ id: "failed", title: "没跑成的事", state: "failed" }),
		item({ id: "paused", title: "暂停的事", state: "paused" }),
		item({ id: "done", title: "做完的事", state: "completed" }),
	]);
	expect(screen.getByRole("img", { name: "Running" })).toBeVisible();
	expect(screen.getByRole("img", { name: "Waiting for you" })).toBeVisible();
	expect(screen.getByRole("img", { name: "Failed" })).toBeVisible();
	expect(screen.getByRole("img", { name: "Paused" })).toBeVisible();
	expect(screen.getByRole("img", { name: "Completed" })).toBeVisible();
	const waiting = screen.getByText("等你确认").closest("button") as HTMLElement;
	expect(waiting.className).toContain("bg-[var(--color-accent-subtle)]");
	const failed = screen.getByText("没跑成的事").closest("button") as HTMLElement;
	expect(failed.className).not.toContain("bg-[var(--color-accent-subtle)]");
});

test("a wait says what it waits for, in words", () => {
	show([item({ id: "waiting", title: "整理账单", state: "waiting_user", waitingReason: "等你确认预算" })]);
	expect(screen.getByText("等你确认预算")).toBeVisible();
});

test("a failure shows the real reason in words, never the server's code", () => {
	show([
		item({ id: "failed", title: "没跑成的事", state: "failed", failureReason: "background_quota_exhausted" }),
		item({
			id: "missed",
			title: "错过的计划",
			source: "schedule_run",
			state: "failed",
			failureReason: "schedule_missed",
		}),
	]);
	expect(screen.getByText("Background quota is used up")).toBeVisible();
	expect(screen.getByText("Missed its scheduled time")).toBeVisible();
	expect(screen.queryByText("background_quota_exhausted")).toBeNull();
	expect(screen.queryByText("schedule_missed")).toBeNull();
});

test("a pause says why it stopped, and a running row says how long", () => {
	const halfHour = new Date(Date.now() - 30 * 60 * 1000).toISOString();
	show([
		item({ id: "paused", title: "暂停的事", state: "paused", failureReason: "device_offline" }),
		item({ id: "running", title: "在跑的活", startedAt: halfHour }),
	]);
	expect(screen.getByText("Device offline; resumes by itself")).toBeVisible();
	expect(screen.getByText(/Running for 30 minutes/)).toBeVisible();
});

test("a placeholder recording title leans on its clock time instead of inventing a name", () => {
	show([
		item({ id: "ph", source: "meeting", title: "录音笔记", state: "completed", endedAt: "2026-11-17T02:30:00Z" }),
		item({
			id: "named",
			source: "meeting",
			title: "与林远的融资沟通",
			state: "completed",
			endedAt: "2026-11-17T02:30:00Z",
		}),
	]);
	const placeholder = screen.getByText("录音笔记").closest("li") as HTMLElement;
	expect(placeholder.textContent).toMatch(/Ended \d{2}:\d{2}/);
	const named = screen.getByText("与林远的融资沟通").closest("li") as HTMLElement;
	expect(named.textContent).not.toContain("Ended");
});

test("an empty account is told so", () => {
	show([]);
	expect(screen.getByText("No items yet")).toBeVisible();
});

/** The folded row at the bottom: it opens the archived section, which the nightly tidy fills. */
const foldedArchive = (expanded: boolean) => screen.getByRole("button", { name: "Archived", expanded });

test("archived items sit folded under the list and are requested only once opened", () => {
	state.archived = [item({ id: "old1", title: "归档的事", state: "completed" })];
	state.archivedRequested = [];
	show([item({ id: "today", title: "今天的事" })]);
	expect(screen.queryByText("归档的事")).toBeNull();
	expect(state.archivedRequested.every((enabled) => !enabled)).toBe(true);
	const toggle = foldedArchive(false);
	fireEvent.click(toggle);
	expect(foldedArchive(true)).toBe(toggle);
	expect(screen.getByText("归档的事")).toBeVisible();
	expect(state.archivedRequested.at(-1)).toBe(true);
});

test("an opened archive with nothing in it says so", () => {
	state.archived = [];
	show([item({ id: "today", title: "今天的事" })]);
	fireEvent.click(foldedArchive(false));
	expect(screen.getByText("No archived items")).toBeVisible();
});

test("a task row offers rename and delete only; the list no longer archives by hand", async () => {
	state.change.mockClear();
	show([
		item({ id: "active", title: "Active task", startedAt: new Date().toISOString() }),
		item({
			id: "old",
			title: "Old task",
			archived: true,
			startedAt: new Date(Date.now() - 60_000).toISOString(),
		}),
	]);
	const row = () => screen.getAllByRole("button", { name: /Active task|Old task/ })[0] as HTMLElement;
	fireEvent.contextMenu(row());
	expect(screen.getByRole("button", { name: "Rename" })).toBeVisible();
	expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
	expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Rename" }));
	const form = screen.getByRole("textbox", { name: "Title" });
	expect(form).toHaveValue("Active task");
	fireEvent.change(form, { target: { value: "Renamed task" } });
	fireEvent.submit(form.closest("form") as HTMLFormElement);
	await waitFor(() =>
		expect(state.change).toHaveBeenCalledWith(
			expect.objectContaining({ id: "active", patch: { title: "Renamed task" } }),
		),
	);
	await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument());

	fireEvent.contextMenu(row());
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	const dialog = screen.getByRole("dialog", { name: "Delete" });
	fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
	await waitFor(() =>
		expect(state.change).toHaveBeenCalledWith(expect.objectContaining({ id: "active", remove: true })),
	);
});

test("every row is a button a keyboard can reach and Enter opens it", () => {
	const opened = vi.fn();
	state.items = [item({ id: "one", title: "第一件" }), item({ id: "two", title: "第二件" })];
	state.contacts = [bot];
	render(
		<I18nextProvider i18n={createI18n("en")}>
			<ItemsList onOpen={opened} />
		</I18nextProvider>,
	);
	const rows = screen.getAllByRole("button", { name: /第一件|第二件/ });
	expect(rows).toHaveLength(2);
	for (const row of rows) {
		expect(row.tagName).toBe("BUTTON");
		row.focus();
		expect(document.activeElement).toBe(row);
		fireEvent.click(row);
	}
	expect(opened).toHaveBeenCalledWith("one");
	expect(opened).toHaveBeenCalledWith("two");
});
