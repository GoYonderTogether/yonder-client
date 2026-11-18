// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ItemSummary, Member } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ItemsList } from "./items-list.tsx";

const state = vi.hoisted(() => ({ items: [] as ItemSummary[], contacts: [] as Member[] }));
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
	useContacts: () => ({ data: { items: state.contacts } }),
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
			<ItemsList onOpen={() => {}} onAdd={() => {}} />
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
	const headings = [...container.querySelectorAll("h3")].map((heading) => heading.textContent);
	expect(headings).toEqual(["Today", "Yesterday", "Earlier"]);
	expect(screen.getByText("今天的事")).toBeVisible();
	expect(screen.getByText("昨天的事")).toBeVisible();
	expect(screen.getByText("很久以前的事")).toBeVisible();
});

test("a row shows the title, its state, the Bot's name and one line of outcome", () => {
	show([
		item({ id: "done", title: "整理会议纪要", state: "completed", result: "纪要已发到对话里。" }),
		item({ id: "waiting", title: "等你确认", state: "waiting_user" }),
	]);
	const done = screen.getByText("整理会议纪要").closest("li");
	expect(done).not.toBeNull();
	expect(within(done as HTMLElement).getByText("Completed")).toBeVisible();
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

test("an empty account is told so, and the plus button is still there", () => {
	show([]);
	expect(screen.getByText("No items yet")).toBeVisible();
	expect(screen.getByRole("button", { name: "New item" })).toBeVisible();
});
