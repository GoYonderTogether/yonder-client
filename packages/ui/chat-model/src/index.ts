export { BOT_FACE_IDS, type BotFaceId, botFaceFor, botFacePaths, firstCharacter, tintFor } from "./avatar.ts";
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

/** Adjacent messages share a sender header without regrouping the conversation. */
export function groupMessages<T extends { senderId: string }>(items: readonly T[]): T[][] {
	const groups: T[][] = [];
	for (const item of items) {
		const last = groups.at(-1);
		if (last?.[0]?.senderId === item.senderId) last.push(item);
		else groups.push([item]);
	}
	return groups;
}

export function isHttpLink(value: string): boolean {
	return /^https?:\/\//i.test(value);
}
