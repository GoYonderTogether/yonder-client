import { mergeMessage } from "@yonder/chat-model";
import type { Message, Run } from "@yonder/protocol";
export type ChatMessage = Message & { sendFailed?: boolean; pending?: boolean; skillIds?: string[] };
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
	const rows = [...current];
	for (const item of incoming) {
		const index = rows.findIndex(
			(row) => row.id === item.id || Boolean(item.clientNonce && row.clientNonce === item.clientNonce),
		);
		if (index < 0) rows.push(item);
		else rows[index] = mergeMessage(rows[index], item);
	}
	return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function updateRun(current: ChatMessage[], run: Run): ChatMessage[] {
	return current.map((message) =>
		message.id === run.messageId
			? {
					...message,
					run: { ...run, ...(run.activity ? {} : message.run?.activity ? { activity: message.run.activity } : {}) },
					streaming: run.status === "queued" || run.status === "running",
				}
			: message,
	);
}
/** Not a member of this group, only watching it (reserved by the visit flow; not in this protocol yet). */
export function isObserver(member: { role?: string }): boolean {
	return (member.role as string | undefined) === "observer";
}

export function conversationTitle(
	members: { memberId: string; displayName: string; role?: string }[],
	ownId?: string,
	title?: string | null,
): string {
	return (
		title ||
		members
			.filter((member) => member.memberId !== ownId && !isObserver(member))
			.map((member) => member.displayName)
			.join("、")
	);
}

/** The one other side of a direct chat, skipping anyone who is only observing it. */
export function directPartner<T extends { memberId: string; role?: string }>(
	members: readonly T[],
	ownId?: string,
): T | undefined {
	return members.find((member) => member.memberId !== ownId && !isObserver(member));
}
