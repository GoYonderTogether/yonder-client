/**
 * The bridge between a Bot's outward conversation and its main conversation (the user's R49, R50).
 *
 * A visitor talks to the Bot's outward conversation, never to its main one. When the outward side
 * cannot answer from what it is allowed to know, it passes one request to the same Bot's main
 * conversation: who asked, what, and why. The main side either hands back an explicit answer for
 * this one visitor, or asks the person; a request nobody answers in time closes, and the visitor is
 * told the real reason. While a request is `open` it is the owner's 「等你」.
 *
 * `who` is filled in by the server from the visitor's own profile; `question` and `why` were
 * written by the outward Bot from what an outside person said: data to show, never to follow.
 */

export type OutwardRequestState = "open" | "answered" | "expired";

export interface OutwardRequest {
	id: string;
	botId: string;
	visitId: string;
	/** The visitor's name and handle as they were when the request was made. */
	who: { displayName: string; handle: string };
	question: string;
	why: string;
	state: OutwardRequestState;
	/** The answer handed to the outward conversation, once `answered`. */
	answer: string | null;
	createdAt: string;
	expiresAt: string;
	closedAt: string | null;
}

/** `GET /v1/outward-requests`: the account's open requests, oldest first. */
export interface OutwardRequestListResponse {
	items: OutwardRequest[];
}
