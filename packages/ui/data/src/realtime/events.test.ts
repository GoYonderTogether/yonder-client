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
	createdAt: "2026-01-01T00:00:00.000Z",
	version: 1,
};

const me: MeResponse = {
	member: person,
	bot: { ...person, id: "bot_1", kind: "bot", displayName: "Yonder" },
	signInMethods: [],
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
				main: { overflow: false, rate: 1, floorPercent: null },
				background: { overflow: true, rate: 1, floorPercent: 20 },
				external: { overflow: false, rate: 1, floorPercent: null },
				coding: { overflow: true, rate: 1.2, floorPercent: null },
			},
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
