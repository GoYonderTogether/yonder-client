import type { ConversationMember, Member, Message } from "@yonder/protocol";
import { expect, test } from "vitest";
import { completionItems, recentSpeakerIds } from "./items.ts";
import { filterCompletions } from "./tokens.ts";

const me: Member = {
	id: "me",
	kind: "person",
	handle: "me",
	displayName: "Me",
	avatarUrl: null,
	bio: null,
	ownerId: null,
	isDefault: false,
	createdAt: "2026-11-01T00:00:00Z",
	version: 1,
};
const member = (id: string, displayName: string, kind: Member["kind"] = "person"): ConversationMember => ({
	memberId: id,
	kind,
	handle: id,
	displayName,
	avatarUrl: null,
});
const contact = (id: string, displayName: string, kind: Member["kind"] = "person"): Member => ({
	...me,
	id,
	kind,
	handle: id,
	displayName,
});

const group = [me, member("b", "小红"), member("c", "小刚")].map((entry) =>
	"memberId" in entry ? entry : member(entry.id, entry.displayName),
);
const contacts = [contact("x", "通讯录甲"), contact("y", "通讯录乙"), contact("z", "通讯录丙")];

function context(
	overrides: Partial<Parameters<typeof completionItems>[0]> = {},
): Parameters<typeof completionItems>[0] {
	return {
		skills: [],
		contacts: [],
		members: [],
		bot: undefined,
		selfId: me.id,
		mentionScope: "group",
		recentMemberIds: [],
		...overrides,
	};
}

test("a group mentions only its own other members, never the address book", () => {
	const items = completionItems(context({ members: group, contacts, selfId: me.id }));
	expect(items.map((item) => item.id)).toEqual(["b", "c"]);
	expect(items.some((item) => contacts.some((contact) => contact.id === item.id))).toBe(false);
});

test("the owner's Bot chat still reaches contacts; another private chat reaches only its peer", () => {
	const agent = completionItems(context({ mentionScope: "agent", contacts, bot: contact("bot", "我的 Bot", "bot") }));
	expect(agent.map((item) => item.id)).toEqual(["x", "y", "z", "bot"]);
	const direct = completionItems(
		context({ mentionScope: "direct", members: [member("me", "Me"), member("peer", "对方")], selfId: "me" }),
	);
	expect(direct.map((item) => item.id)).toEqual(["peer"]);
});

test("recent speakers lead, everyone else keeps the conversation's order", () => {
	const items = completionItems(context({ members: group, selfId: me.id, recentMemberIds: ["c"] }));
	expect(items.map((item) => item.id)).toEqual(["c", "b"]);
});

test("prefix matches come first and the order stays stable as more is typed", () => {
	const members = [member("a1", "Ada"), member("b1", "Bella"), member("a2", "Ava")];
	const items = completionItems(context({ members, selfId: me.id }));
	const filtered = (query: string) => filterCompletions(items, query, "@").map((item) => item.id);
	// `a` matches all three, two by prefix, so the prefix pair keeps the list's own order.
	expect(filtered("a")).toEqual(["a1", "a2", "b1"]);
	expect(filtered("av")).toEqual(["a2"]);
	expect(filtered("b")).toEqual(["b1"]);
});

test("only colliding display names show a handle", () => {
	const members = [member("s1", "同名"), member("s2", "同名"), member("unique", "独名")];
	const items = completionItems(context({ members, selfId: me.id }));
	const shown = items.filter((item) => item.kind === "member" && item.showHandle).map((item) => item.id);
	expect(shown).toEqual(["s1", "s2"]);
	expect(items.find((item) => item.id === "unique")?.showHandle).toBeUndefined();
	// The handle stays searchable even when it is not shown.
	expect(filterCompletions(items, "s2", "@").map((item) => item.id)).toEqual(["s2"]);
});

test("only the Bot chat's mention list asks for the key hint", () => {
	const rows = completionItems(context({ members: group, selfId: me.id }));
	expect(rows.some((item) => item.keyboardHint)).toBe(false);
	const agent = completionItems(context({ mentionScope: "agent", contacts: [contact("x", "甲")] }));
	expect(agent.every((item) => item.keyboardHint)).toBe(true);
});

test("recent speakers read the loaded history, newest first, system lines skipped", () => {
	const at = (n: number) => `2026-11-25T00:00:${String(n).padStart(2, "0")}Z`;
	const raw = (id: string, senderId: string, createdAt: string, type: Message["type"] = "text"): Message => ({
		id,
		conversationId: "c",
		senderId,
		senderKind: "person",
		type,
		body: null,
		attachments: [],
		replyToId: null,
		createdAt,
		editedAt: null,
		streaming: false,
		version: 1,
	});
	const messages = [raw("1", "a", at(1)), raw("2", "b", at(2)), raw("3", "a", at(3)), raw("4", "s", at(4), "system")];
	expect(recentSpeakerIds(messages)).toEqual(["a", "b"]);
	expect(recentSpeakerIds(undefined)).toEqual([]);
});
