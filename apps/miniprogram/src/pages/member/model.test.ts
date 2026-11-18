import type { MemberProfileResponse } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import { cardAction, loadCard } from "./model";

const card: MemberProfileResponse["card"] = {
	kind: "person",
	handle: "someone",
	displayName: "Someone",
	avatarUrl: null,
	bio: null,
	owner: null,
};
const profile = (value: Partial<MemberProfileResponse>): MemberProfileResponse => ({ card, ...value });

describe("card primary action", () => {
	it("offers nothing on my own member or my own Bot", () => {
		expect(cardAction(profile({ relation: "self" }))).toEqual({ kind: "none" });
		expect(cardAction(profile({ relation: "own_bot", conversationId: "c" }))).toEqual({ kind: "none" });
	});
	it("opens the existing chat, and a contact without one through the contact call", () => {
		expect(cardAction(profile({ relation: "contact", conversationId: "c" }))).toEqual({
			kind: "open_chat",
			conversationId: "c",
		});
		expect(cardAction(profile({ relation: "contact", conversationId: null }))).toEqual({ kind: "open_chat" });
	});
	it("adds a stranger who is a person, and starts a chat with a stranger's Bot", () => {
		expect(cardAction(profile({ relation: "none" }))).toEqual({ kind: "add_contact" });
		expect(cardAction(profile({ relation: "none", card: { ...card, kind: "bot" } }))).toEqual({
			kind: "start_chat",
		});
	});
	it("offers nothing when no relation came back", () => {
		expect(cardAction(profile({}))).toEqual({ kind: "none" });
	});
});

it("turns a 404 into one neutral not-found result and rethrows anything else", async () => {
	const { ApiError } = await import("@yonder/api-client");
	const missing = new ApiError({ code: "not_found", status: 404, message: "no such member" });
	expect(await loadCard(async () => Promise.reject(missing))).toEqual({ notFound: true });
	const offline = new Error("offline");
	await expect(loadCard(async () => Promise.reject(offline))).rejects.toBe(offline);
	expect(await loadCard(async () => profile({ relation: "contact" }))).toEqual({
		profile: profile({ relation: "contact" }),
	});
});
