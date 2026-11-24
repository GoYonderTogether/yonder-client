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
	isDefault: true,
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

test("items are grouped into today, yesterday and earlier, with earlier collapsed", () => {
	const now = new Date();
	const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
	const older = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const { container } = show([
		item({ id: "today", title: "今天的事", startedAt: now.toISOString() }),
		item({ id: "yesterday", title: "昨天的事", startedAt: yesterday }),
		item({ id: "old", title: "很久以前的事", startedAt: older }),
	]);
	const headings = [...container.querySelectorAll("h2")].map((heading) => heading.textContent);
	expect(headings).toEqual(["Today", "Yesterday", "Earlier"]);
	expect(screen.getByText("今天的事")).toBeVisible();
	expect(screen.getByText("昨天的事")).toBeVisible();
	expect(screen.getByText("很久以前的事")).toBeVisible();
});

test("a row shows the title, the word the owner acts on, the Bot and one line of outcome", () => {
	show([
		item({ id: "done", title: "整理会议纪要", state: "completed", result: "纪要已发到对话里。" }),
		item({ id: "waiting", title: "等你确认", state: "waiting_user" }),
	]);
	const done = screen.getByText("整理会议纪要").closest("li");
	expect(done).not.toBeNull();
	// A finished item adds no state word (2026-11-24); its result line says what it did.
	expect(within(done as HTMLElement).queryByText("Completed")).toBeNull();
	expect(within(done as HTMLElement).getByText("纪要已发到对话里。")).toBeVisible();
	expect(within(done as HTMLElement).getByText(/我的 Bot/)).toBeVisible();

	// A blocked item says it waits, and does not pretend to have a result.
	const waiting = screen.getByText("等你确认").closest("li");
	expect(within(waiting as HTMLElement).getByText("Waiting for you")).toBeVisible();
	expect(within(waiting as HTMLElement).getByText("No result yet")).toBeVisible();
});

test("a failure shows the real reason the server recorded, never a made-up success", () => {
	show([
		item({
			id: "failed",
			title: "没跑成的事",
			state: "failed",
			failureReason: "background_quota_exhausted",
			result: "半截",
		}),
	]);
	const row = screen.getByText("没跑成的事").closest("li") as HTMLElement;
	expect(within(row).getByText("Failed")).toBeVisible();
	expect(within(row).getByText("Background quota is used up, so this task did not run.")).toBeVisible();
	expect(within(row).queryByText("半截")).toBeNull();
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
	show([item({ id: "active", title: "Active task" }), item({ id: "old", title: "Old task", archived: true })]);
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

test("no completed or cancelled word is added to a row; a paused one is, with no control", () => {
	show([
		item({ id: "done", title: "做完的事", state: "completed" }),
		item({ id: "cancelled", title: "取消的事", state: "cancelled" }),
		item({ id: "paused", title: "暂停的事", state: "paused" }),
	]);
	expect(screen.queryByText("Completed")).toBeNull();
	expect(screen.queryByText("Cancelled")).toBeNull();
	expect(within(screen.getByText("暂停的事").closest("li") as HTMLElement).getByText("Paused")).toBeVisible();
});
