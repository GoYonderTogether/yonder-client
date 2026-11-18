import { ApiError } from "@yonder/api-client";
import type { MemberProfileResponse } from "@yonder/protocol";

export type CardResult = { profile: MemberProfileResponse } | { notFound: true };

/** Missing, closed, deleted and suspended all answer one 404; the page shows one neutral state. */
export async function loadCard(load: () => Promise<MemberProfileResponse>): Promise<CardResult> {
	try {
		return { profile: await load() };
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) return { notFound: true };
		throw error;
	}
}

/**
 * The one thing a card offers, chosen by how the viewer already stands with this member. A Bot
 * that is not mine is opened directly (R6); a person who is not a contact is added first (R7).
 * `start_chat` is handed to whoever registers the visit entry; without one the page shows nothing.
 */
export type CardAction =
	| { kind: "none" }
	| { kind: "open_chat"; conversationId?: string }
	| { kind: "add_contact" }
	| { kind: "start_chat" };

export function cardAction(profile: MemberProfileResponse): CardAction {
	if (profile.relation === "self" || profile.relation === "own_bot") return { kind: "none" };
	if (profile.conversationId) return { kind: "open_chat", conversationId: profile.conversationId };
	if (profile.relation === "contact") return { kind: "open_chat" };
	if (profile.relation === "none")
		return profile.card.kind === "bot" ? { kind: "start_chat" } : { kind: "add_contact" };
	// A card read without a session carries no relation; this page is only reached signed in.
	return { kind: "none" };
}
