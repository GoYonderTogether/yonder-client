import { QueryClient } from "@tanstack/react-query";
import type { Conversation, Member, MeResponse } from "@yonder/protocol";
import { describe, expect, test } from "vitest";
import { keys } from "../query/keys.ts";
import { applyServerEvent, reconcileRealtime } from "./events.ts";

const person: Member = {
	id: "mem_1",
	kind: "person",
	handle: "abc123xyz",
	displayName: "Old name",
	avatarUrl: null,
	bio: null,
	ownerId: null,
	isDefault: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	version: 1,
};

const me: MeResponse = {
	member: person,
	bot: { ...person, id: "bot_1", kind: "bot", displayName: "Yonder", ownerId: "mem_1", isDefault: true },
	signInMethods: [],
	handleChange: { canChange: true, nextChangeAt: null },
	hasPassword: false,
	settings: { locale: "en", theme: "system" },
};

describe("applyServerEvent", () => {
	test("terminal runs refresh skills even when a write succeeds before the reply fails", () => {
		for (const status of ["queued", "running", "completed", "failed", "cancelled"] as const) {
			const queryClient = new QueryClient();
			const skillKeys = [keys.skills.list(), keys.skills.detail("s"), keys.skills.file("s", "v1", "SKILL.md")];
			for (const key of skillKeys) queryClient.setQueryData(key, {});
			applyServerEvent(queryClient, {
				type: "run.updated",
				eventId: `run-${status}`,
				at: "2026-11-16T00:00:00Z",
				run: { id: "run", conversationId: "c", messageId: "output", userMessageId: "input", status },
			});
			for (const key of skillKeys)
				expect(queryClient.getQueryState(key)?.isInvalidated).toBe(status !== "queued" && status !== "running");
			queryClient.clear();
		}
	});
	test("a file change refreshes its details, history and matching directories, and reconnect refreshes all memory", () => {
		const queryClient = new QueryClient();
		const path = "/notes/周报.md";
		const related = [
			keys.memory.file(path),
			keys.memory.revisions(path),
			keys.memory.files(""),
			keys.memory.files("/notes/"),
		];
		const unrelated = [keys.memory.file("/me/印象.md"), keys.memory.files("/digests/"), keys.memory.days()];
		for (const key of [...related, ...unrelated]) queryClient.setQueryData(key, {});
		const event = { type: "memory.changed", eventId: "file-1", at: "2026-11-16T00:00:00Z" } as const;
		applyServerEvent(queryClient, { ...event, paths: [path] });
		for (const key of related) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
		for (const key of unrelated) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
		reconcileRealtime(queryClient);
		for (const key of unrelated) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
		queryClient.clear();
	});
	test("device changes and reconnects reconcile the device list and linked login sessions", () => {
		const queryClient = new QueryClient();
		for (const key of [keys.devices(), keys.sessions()]) queryClient.setQueryData(key, { items: [] });
		applyServerEvent(queryClient, { type: "devices.changed", eventId: "devices-1", at: "2026-11-15T00:00:00Z" });
		for (const key of [keys.devices(), keys.sessions()])
			expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
		for (const key of [keys.devices(), keys.sessions()]) queryClient.setQueryData(key, { items: [] });
		reconcileRealtime(queryClient);
		for (const key of [keys.devices(), keys.sessions()])
			expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
	});
	test("opening the realtime connection marks conversation, message and quota caches for reconciliation", () => {
		const queryClient = new QueryClient();
		for (const key of [keys.conversations.list(), keys.messages.latest("c"), keys.quota(), keys.usage("all")]) {
			queryClient.setQueryData(key, {});
		}
		reconcileRealtime(queryClient);
		for (const key of [keys.conversations.list(), keys.messages.latest("c"), keys.quota(), keys.usage("all")]) {
			expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
		}
	});
	test("a memory change invalidates the timeline, and a reconnect reconciles it", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(keys.memory.days(), { pages: [] });
		applyServerEvent(queryClient, {
			type: "memory.changed",
			eventId: "memory-1",
			at: "2026-11-16T00:00:00Z",
			dates: ["2026-11-16"],
		});
		expect(queryClient.getQueryState(keys.memory.days())?.isInvalidated).toBe(true);
		queryClient.setQueryData(keys.memory.days(), { pages: [] });
		reconcileRealtime(queryClient);
		expect(queryClient.getQueryState(keys.memory.days())?.isInvalidated).toBe(true);
	});
	test("a member update replaces the cached profile in place, with no request", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(keys.me(), me);

		const updated: Member = { ...person, displayName: "New name", version: 2 };
		applyServerEvent(queryClient, {
			type: "member.updated",
			eventId: "e1",
			at: "2026-01-01T00:00:01.000Z",
			member: updated,
		});

		const cached = queryClient.getQueryData<MeResponse>(keys.me());
		expect(cached?.member.displayName).toBe("New name");
		expect(cached?.member.version).toBe(2);
		expect(cached?.bot.displayName).toBe("Yonder");
	});

	test("a member update for someone else leaves the cached profile alone", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(keys.me(), me);
		applyServerEvent(queryClient, {
			type: "member.updated",
			eventId: "e2",
			at: "2026-01-01T00:00:01.000Z",
			member: { ...person, id: "mem_other", displayName: "Someone else" },
		});
		expect(queryClient.getQueryData<MeResponse>(keys.me())?.member.displayName).toBe("Old name");
	});

	test("a session revocation reports the loss instead of patching data", () => {
		let lost = false;
		applyServerEvent(
			new QueryClient(),
			{ type: "session.revoked", eventId: "e3", at: "2026-01-01T00:00:01.000Z", sessionId: "ses_1" },
			{ onSessionLost: () => (lost = true) },
		);
		expect(lost).toBe(true);
	});

	test("a quota update replaces the balance and invalidates ledger and invite statistics", () => {
		const queryClient = new QueryClient();
		const pools = {
			main: { granted: 2, used: 0, remaining: 2, remainingPercent: 100 },
			background: { granted: 0, used: 0, remaining: 0, remainingPercent: 0 },
			external: { granted: 0, used: 0, remaining: 0, remainingPercent: 0 },
			coding: { granted: 0, used: 0, remaining: 0, remainingPercent: 0 },
		};
		const quota = {
			balance: 2,
			granted: 2,
			used: 0,
			pools,
			overflow: {
				main: { overflow: false, rate: 1, floor: null },
				background: { overflow: true, rate: 1, floor: 4_000_000 },
				external: { overflow: false, rate: 1, floor: null },
				coding: { overflow: true, rate: 1.2, floor: 4_000_000 },
			},
			configVersion: 1,
			cycle: { start: "2026-11-01T00:00:00.000Z", resetsAt: "2026-12-01T00:00:00.000Z" },
		};
		queryClient.setQueryData(keys.quota(), { ...quota, balance: 1, granted: 1 });
		queryClient.setQueryData(keys.ledger(), { pages: [] });
		queryClient.setQueryData(keys.invite(), { stats: { invitedCount: 0 } });
		applyServerEvent(queryClient, {
			type: "quota.updated",
			eventId: "e4",
			at: "2026-01-01T00:00:01.000Z",
			quota,
		});
		expect(queryClient.getQueryData(keys.quota())).toEqual(quota);
		expect(queryClient.getQueryState(keys.ledger())?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(keys.invite())?.isInvalidated).toBe(true);
	});
});

test("conversation events insert once and reject older versions", () => {
	const client = new QueryClient();
	const conversation: Conversation = {
		id: "c",
		kind: "direct",
		title: "latest",
		members: [],
		lastMessageAt: null,
		unreadCount: 0,
		pinned: false,
		version: 2,
	};
	applyServerEvent(client, { type: "conversation.updated", eventId: "e1", at: "now", conversation });
	applyServerEvent(client, {
		type: "conversation.updated",
		eventId: "e2",
		at: "now",
		conversation: { ...conversation, title: "old", version: 1 },
	});
	expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items).toEqual([conversation]);
});

test("a system message updates the list preview even though it has no body", () => {
	const client = new QueryClient();
	client.setQueryData(keys.conversations.list(), {
		items: [{ id: "c", lastMessageAt: null, lastMessage: null, members: [], version: 1 }],
	});
	const system = {
		event: "dissolved" as const,
		actorName: null,
		targetNames: [],
	};
	applyServerEvent(client, {
		type: "message.created",
		eventId: "e1",
		at: "now",
		message: {
			id: "m1",
			conversationId: "c",
			senderId: "system",
			senderKind: "person",
			type: "system",
			system,
			body: null,
			attachments: [],
			replyToId: null,
			createdAt: "2026-11-17T00:00:00Z",
			editedAt: null,
			streaming: false,
			version: 1,
		},
	});
	const preview = client.getQueryData<{
		items: { lastMessage: { type: string; system: typeof system } | null }[];
	}>(keys.conversations.list())?.items[0]?.lastMessage;
	expect(preview?.type).toBe("system");
	expect(preview?.system).toEqual(system);
});

/** A Bot's name lives in four caches at once; a rename must reach all of them (15 第五节). */
test("a member update reaches contacts, conversation rows and me.bot, not only me.member", () => {
	const client = new QueryClient();
	const yakko = {
		...person,
		id: "bot_1",
		kind: "bot" as const,
		displayName: "Yonder",
		ownerId: "mem_1",
		isDefault: true,
	};
	client.setQueryData<MeResponse>(keys.me(), { ...me, bot: yakko });
	client.setQueryData(keys.contacts(), { items: [person, yakko] });
	const group: Conversation = {
		id: "c",
		kind: "group",
		title: null,
		members: [
			{ memberId: "mem_1", kind: "person", handle: "abc123xyz", displayName: "Old name", avatarUrl: null },
			{ memberId: "bot_1", kind: "bot", handle: "yonder", displayName: "Yonder", avatarUrl: null, avatarColor: "1" },
		],
		lastMessageAt: null,
		unreadCount: 0,
		pinned: false,
		version: 3,
	};
	client.setQueryData(keys.conversations.list(), { items: [group] });

	const renamed: Member = {
		...yakko,
		displayName: "Researcher",
		avatarUrl: "https://cdn.example/new.png",
		version: 2,
	};
	let reported: Member | undefined;
	applyServerEvent(
		client,
		{ type: "member.updated", eventId: "e1", at: "now", member: renamed },
		{ onMemberUpdated: (member) => (reported = member) },
	);

	expect(client.getQueryData<MeResponse>(keys.me())?.bot.displayName).toBe("Researcher");
	expect(client.getQueryData<MeResponse>(keys.me())?.member.displayName).toBe("Old name");
	expect(client.getQueryData<{ items: Member[] }>(keys.contacts())?.items[1]?.displayName).toBe("Researcher");
	const row = client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0];
	expect(row?.members[1]).toMatchObject({ displayName: "Researcher", avatarUrl: "https://cdn.example/new.png" });
	expect(row?.members[0]?.displayName).toBe("Old name");
	expect(reported?.id).toBe("bot_1");
});

test("an older member payload never replaces the newer copy already cached", () => {
	const client = new QueryClient();
	const bot = { ...person, id: "bot_1", kind: "bot" as const, displayName: "Newest", version: 5 };
	client.setQueryData(keys.contacts(), { items: [bot] });
	applyServerEvent(client, {
		type: "member.updated",
		eventId: "e1",
		at: "now",
		member: { ...bot, displayName: "Older", version: 4 },
	});
	expect(client.getQueryData<{ items: Member[] }>(keys.contacts())?.items[0]?.displayName).toBe("Newest");
});

test("a removed member leaves contacts and every conversation it was in", () => {
	const client = new QueryClient();
	const bot = { ...person, id: "bot_1", kind: "bot" as const, ownerId: "mem_1" };
	client.setQueryData(keys.contacts(), { items: [person, bot] });
	const group: Conversation = {
		id: "c",
		kind: "group",
		title: "Team",
		members: [
			{ memberId: "mem_1", kind: "person", handle: "abc123xyz", displayName: "Old name", avatarUrl: null },
			{ memberId: "bot_1", kind: "bot", handle: "yonder", displayName: "Yonder", avatarUrl: null },
		],
		lastMessageAt: null,
		unreadCount: 0,
		pinned: false,
		version: 3,
	};
	client.setQueryData(keys.conversations.list(), { items: [group] });
	let removed: string | undefined;
	applyServerEvent(
		client,
		{ type: "member.removed", eventId: "e1", at: "now", memberId: "bot_1" },
		{ onMemberRemoved: (id) => (removed = id) },
	);

	expect(client.getQueryData<{ items: Member[] }>(keys.contacts())?.items.map((item) => item.id)).toEqual(["mem_1"]);
	expect(
		client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items[0]?.members.map((m) => m.memberId),
	).toEqual(["mem_1"]);
	expect(removed).toBe("bot_1");
});

test("a removed conversation leaves the list and its cached history, and reports itself", () => {
	const client = new QueryClient();
	const conversation: Conversation = {
		id: "c",
		kind: "direct",
		title: null,
		members: [],
		lastMessageAt: null,
		unreadCount: 0,
		pinned: false,
		version: 1,
	};
	client.setQueryData(keys.conversations.list(), { items: [conversation] });
	client.setQueryData(keys.messages.latest("c"), { pages: [{ items: [], nextCursor: null, hasMore: false }] });
	let removed: string | undefined;
	applyServerEvent(
		client,
		{ type: "conversation.removed", eventId: "e1", at: "now", conversationId: "c" },
		{ onConversationRemoved: (id) => (removed = id) },
	);

	expect(client.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items).toEqual([]);
	expect(client.getQueryData(keys.messages.latest("c"))).toBeUndefined();
	expect(removed).toBe("c");
});

test("a catalog change keeps a copy at the announced version and drops an older one", () => {
	const client = new QueryClient();
	const catalog = { version: 3 } as never;
	client.setQueryData(keys.quotaConfig(), catalog);
	applyServerEvent(client, { type: "quota.config_changed", eventId: "q1", at: "now", version: 3 });
	expect(client.getQueryData(keys.quotaConfig())).toEqual(catalog);
	applyServerEvent(client, { type: "quota.config_changed", eventId: "q2", at: "now", version: 4 });
	expect(client.getQueryData(keys.quotaConfig())).toBeUndefined();
});

// A subtask's state changes as it runs; the items page shows it and may have its detail open. The
// client used to ignore this event, which is why the page stayed empty.
test("a subtask event refreshes the item list and any open item detail", () => {
	const client = new QueryClient();
	const list = keys.items.list(null);
	const detail = keys.items.detail("run_1");
	client.setQueryData(list, { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });
	client.setQueryData(detail, { id: "run_1", state: "running" });
	applyServerEvent(client, {
		type: "subtask.updated",
		eventId: "subtask-1",
		at: "2026-11-17T00:00:00.000Z",
		subtask: {
			id: "run_1",
			conversationId: "c",
			parentRunId: "run_parent",
			title: "查报销规则",
			status: "background",
			createdAt: "2026-11-17T00:00:00.000Z",
		},
	});
	expect(client.getQueryState(list)?.isInvalidated).toBe(true);
	expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
});
