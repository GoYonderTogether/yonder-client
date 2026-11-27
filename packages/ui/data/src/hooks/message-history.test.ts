import { type InfiniteData, InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type { Message, MessagePage, Run } from "@yonder/protocol";
import { expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { applyChatHistoryClear, updateMessage, updateRun } from "../realtime/message-cache.ts";
import { fetchHistoryPage, shareMessageHistory } from "./message-history.ts";

const conversation = "chat";
const key = keys.messages.latest(conversation);
const row = (id: string, version = 1, createdAt = "2026-11-22T12:00:00.000Z"): Message => ({
	id,
	conversationId: conversation,
	senderId: "bot",
	senderKind: "bot",
	type: "text",
	body: `v${version}`,
	attachments: [],
	replyToId: null,
	createdAt,
	editedAt: null,
	streaming: version === 1,
	version,
});
const page = (items: Message[], nextCursor: string | null = null) => ({ items, nextCursor, hasMore: !!nextCursor });

function deferred<T = MessagePage>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function options(client: QueryClient, load: (cursor?: string) => Promise<MessagePage>) {
	return {
		queryKey: key,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			fetchHistoryPage(client, conversation, () => load(pageParam)),
		getNextPageParam: ({ nextCursor }: MessagePage) => nextCursor ?? undefined,
		structuralSharing: shareMessageHistory,
	};
}

test("a multi-page HTTP refresh keeps newer and newly arrived realtime messages at the final write", async () => {
	const client = new QueryClient();
	const first = page([row("same"), row("falls-out"), row("run")], "older");
	const older = deferred();
	const requested = deferred<void>();
	client.setQueryData(key, { pages: [first, page([row("old")])], pageParams: [undefined, "older"] });
	const refreshing = client.fetchInfiniteQuery(
		options(client, async (cursor) => {
			if (!cursor) return page([row("same"), row("run")], "older");
			requested.resolve();
			return older.promise;
		}),
	);
	await requested.promise;
	updateMessage(client, row("same", 2));
	updateMessage(client, row("new"));
	const run: Run = { id: "r", conversationId: conversation, messageId: "run", userMessageId: "u", status: "completed" };
	updateRun(client, run);
	older.resolve(page([row("old")]));
	await refreshing;
	const data = client.getQueryData<InfiniteData<MessagePage>>(key);
	expect(data?.pages[0]?.items).toEqual([row("same", 2), { ...row("run"), run }, row("new")]);
	expect(data?.pages[1]?.items).toEqual([row("old")]);
	expect(data?.pageParams).toEqual([undefined, "older"]);
	client.clear();
});

test("loading an older page cannot restore a copied stale latest page or duplicate a moved row", async () => {
	const client = new QueryClient();
	const older = deferred();
	const requested = deferred<void>();
	client.setQueryData(key, { pages: [page([row("same")], "older")], pageParams: [undefined] });
	const observer = new InfiniteQueryObserver(
		client,
		options(client, async () => {
			requested.resolve();
			return older.promise;
		}),
	);
	const fetching = observer.fetchNextPage();
	await requested.promise;
	updateMessage(client, row("same", 2));
	updateMessage(client, row("new"));
	older.resolve(page([row("same"), row("older")]));
	await fetching;
	const data = client.getQueryData<InfiniteData<MessagePage>>(key);
	expect(data?.pages.map(({ items }) => items)).toEqual([[row("same", 2), row("new")], [row("older")]]);
	expect(data?.pageParams).toEqual([undefined, "older"]);
	client.clear();
});

test("a delayed pre-clear page cannot restore hidden rows or old cursors", async () => {
	const client = new QueryClient();
	const cutoff = { createdAt: "2026-11-22T12:01:00.000000Z", messageId: "old" };
	const old = row("old");
	const earlier = row("current", 1, "2026-11-22T12:02:00.000Z");
	const current = { ...earlier, body: "v2", streaming: false, version: 2 };
	const late = deferred();
	client.setQueryData(key, { pages: [page([old, earlier], "old-cursor")], pageParams: [undefined] });
	const refreshing = client.fetchInfiniteQuery(options(client, () => late.promise)).catch(() => undefined);
	updateMessage(client, current);
	applyChatHistoryClear(client, conversation, cutoff);
	late.resolve(page([old], "old-cursor"));
	await refreshing;
	expect(client.getQueryData<InfiniteData<MessagePage>>(key)?.pages).toEqual([
		{ ...page([current]), historyClearedThrough: cutoff },
	]);
	await client.fetchInfiniteQuery(options(client, async () => page([old], "old-cursor")));
	expect(client.getQueryData<InfiniteData<MessagePage>>(key)?.pages).toEqual([
		{ ...page([current]), historyClearedThrough: cutoff },
	]);
	client.clear();
});

test("history already in flight cannot overwrite a same-version vote change or unredact a recalled reply", async () => {
	const client = new QueryClient();
	const voted = { ...row("vote"), feedback: "up" as const };
	const source = row("source");
	const reply = {
		...row("reply"),
		replyToId: source.id,
		replyTo: { id: source.id, senderId: source.senderId, snippet: "original" },
	};
	const stale = page([voted, source, reply]);
	client.setQueryData(key, { pages: [stale], pageParams: [undefined] });
	const late = deferred();
	const fetching = client.fetchInfiniteQuery(options(client, () => late.promise));
	updateMessage(client, row("vote"));
	updateMessage(client, {
		...source,
		recalled: { at: source.createdAt, by: "sender" },
		body: null,
		version: source.version + 1,
	});
	late.resolve(stale);
	await fetching;
	const items = client.getQueryData<InfiniteData<MessagePage>>(key)?.pages[0]?.items;
	expect(items?.[0]).not.toHaveProperty("feedback");
	expect(items?.[1]).toMatchObject({ body: null, recalled: { by: "sender" } });
	expect(items?.[2]?.replyTo).toMatchObject({ snippet: "", recalled: true });
	client.clear();
});
