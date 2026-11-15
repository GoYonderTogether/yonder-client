import { QueryClient } from "@tanstack/react-query";
import type { Member, MeResponse } from "@yonder/protocol";
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
		queryClient.setQueryData(keys.quota(), { balance: 1, granted: 1, used: 0 });
		queryClient.setQueryData(keys.ledger(), { pages: [] });
		queryClient.setQueryData(keys.invite(), { stats: { invitedCount: 0 } });
		applyServerEvent(queryClient, {
			type: "quota.updated",
			eventId: "e4",
			at: "2026-01-01T00:00:01.000Z",
			quota: { balance: 2, granted: 2, used: 0 },
		});
		expect(queryClient.getQueryData(keys.quota())).toEqual({ balance: 2, granted: 2, used: 0 });
		expect(queryClient.getQueryState(keys.ledger())?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(keys.invite())?.isInvalidated).toBe(true);
	});
});
