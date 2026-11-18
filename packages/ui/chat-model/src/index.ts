export { agentChatStatus, isTwoPartyAgentChat } from "./agent-chat.ts";
export { BOT_FACE_IDS, type BotFaceId, botFaceFor, botFacePaths, firstCharacter, tintFor } from "./avatar.ts";
export { conversationPeer } from "./conversation-peer.ts";
export { addableContacts, filterContacts, GROUP_MEMBER_LIMIT, recentContacts } from "./group-invites.ts";
export { runSources } from "./run-sources.ts";

import type { Message } from "@yonder/protocol";

/** Preserve a newer server message and an already received run when a snapshot omits it. */
export function mergeMessage<T extends Message>(old: T, incoming: T): T {
	if (!old.id.startsWith("temp_") && old.version > incoming.version) return old;
	return {
		...incoming,
		...(incoming.run == null && old.run
			? { run: old.run }
			: incoming.run && old.run?.id === incoming.run.id && !incoming.run.activity && old.run.activity
				? { run: { ...incoming.run, activity: old.run.activity } }
				: {}),
	};
}

/** A finished Bot reply can become readable after a message sent later in the chat. */
export function newestReadableMessage(items: readonly Message[], personId: string): string | undefined {
	let newest: Message | undefined;
	for (const message of items) {
		if (
			message.id.startsWith("temp_") ||
			message.senderId === personId ||
			message.streaming ||
			message.system?.event === "memory_updated" ||
			(message.type === "text" && !message.body?.trim() && !message.attachments.length)
		)
			continue;
		const at = message.readableAt ?? message.createdAt;
		const previous = newest?.readableAt ?? newest?.createdAt;
		if (!newest || !previous || at > previous || (at === previous && message.id > newest.id)) newest = message;
	}
	return newest?.id;
}

export type MessageBlock<T> = { time: Date; messageId: string } | { run: T[] };

/** A time label breaks a sender run, and a system message stands on its own. */
export function groupMessages<T extends Pick<Message, "id" | "senderId" | "type" | "createdAt">>(items: readonly T[]) {
	const blocks: MessageBlock<T>[] = [];
	let previous: Date | undefined;
	for (const item of items) {
		const at = new Date(item.createdAt);
		const milliseconds = at.getTime();
		if (Number.isFinite(milliseconds)) {
			if (
				!previous ||
				milliseconds - previous.getTime() >= 5 * 60_000 ||
				at.toDateString() !== previous.toDateString()
			) {
				blocks.push({ time: at, messageId: item.id });
			}
			previous = at;
		}
		const last = blocks.at(-1);
		const run = last && "run" in last ? last.run : undefined;
		const sender = run?.[0];
		if (run && item.type !== "system" && sender?.type !== "system" && sender?.senderId === item.senderId) {
			run.push(item);
		} else {
			blocks.push({ run: [item] });
		}
	}
	return blocks;
}

export function isHttpLink(value: string): boolean {
	return /^https?:\/\//i.test(value);
}
