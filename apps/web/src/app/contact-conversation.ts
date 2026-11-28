import type { Conversation, Member } from "@yonder/protocol";

/** The ordinary direct chat with the contact whose handle is selected, when one already exists. */
export function directConversationFor(
	handle: string | null,
	contacts: readonly Member[] | undefined,
	conversations: readonly Conversation[] | undefined,
) {
	const member = handle ? contacts?.find((item) => item.handle === handle) : undefined;
	if (!member) return undefined;
	return conversations?.find(
		(item) => item.kind === "direct" && !item.visit && item.members.some((peer) => peer.memberId === member.id),
	);
}
