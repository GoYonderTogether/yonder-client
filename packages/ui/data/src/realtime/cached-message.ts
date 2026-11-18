import type { Message } from "@yonder/protocol";

/** A message as the query cache holds it: the server's copy plus this tab's send state. */
export type CachedMessage = Message & {
	pending?: boolean;
	sendFailed?: boolean;
	skillIds?: string[];
	mentionedMemberIds?: string[];
};
