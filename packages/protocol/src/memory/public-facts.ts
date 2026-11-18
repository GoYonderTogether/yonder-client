/**
 * The public library (21-社交Bot为什么存在 第六节; the user's R22, R37, R41, R45–R50).
 *
 * One per person, shared by all of their Bots. It is not written for people to read: it is what
 * someone else learns about this person through a Bot. A fact takes effect only once the person
 * confirmed it — they wrote it on the memory page, or a Bot proposed it while handling a visitor's
 * request and they agreed. A proposed fact never reaches any outward conversation.
 */

export type PublicFactStatus = "active" | "proposed";

export interface PublicFact {
	id: string;
	text: string;
	status: PublicFactStatus;
	/** `owner`: written on the memory page. `bot`: proposed by one of the person's Bots. */
	source: "owner" | "bot";
	/** The Bot that proposed it; null when the person wrote it, or that Bot is gone. */
	proposedByBotId: string | null;
	createdAt: string;
	updatedAt: string;
}

/** `GET /v1/me/public-facts`: active and proposed facts, oldest first. */
export interface PublicFactListResponse {
	items: PublicFact[];
}

/** `POST /v1/me/public-facts`: the person writes a fact; it is active at once. */
export interface CreatePublicFactRequest {
	text: string;
}

/** `PATCH /v1/me/public-facts/:id`: the text changes, the status does not. */
export interface UpdatePublicFactRequest {
	text: string;
}
