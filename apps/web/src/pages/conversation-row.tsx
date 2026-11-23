import { conversationBotOwner, ownedBotFor } from "@yonder/chat-model";
import { BotName, type Translate } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { ConversationRow, type RowAction } from "@yonder/ui-components";
import { BellOff, Pin } from "lucide-react";
import { ConversationAvatar, conversationPeer, conversationTitle } from "./conversation-presentation.tsx";
import { rowPreview } from "./message-preview.ts";
import { UnreadBadge } from "./unread-badge.tsx";

/**
 * One row of the message list (19 第三节): who, the last line of the conversation in the reader's
 * language, when, and the small state marks. The row's actions are built by the list so a pending
 * delete or pin can disable them together. Split out of messages-page.tsx to stay under the file
 * limit once both the row actions and the older-page loader landed.
 */
export function ConversationEntry({
	conversation,
	current,
	personId,
	bot,
	primary,
	contacts,
	mobile,
	locale,
	actions,
	onOpen,
	t,
}: {
	conversation: Conversation;
	/** The open conversation id, so the row shows as selected. */
	current: string | null;
	personId: string | undefined;
	bot: Member | null | undefined;
	/** The main Bot's conversation id: the row opens it as `/messages/main`. */
	primary: string | undefined;
	contacts: readonly Member[] | undefined;
	mobile: boolean;
	locale: string;
	actions: readonly RowAction[];
	t: Translate;
	onOpen: () => void;
}) {
	const peer = conversation.kind === "direct" ? conversationPeer(conversation, personId) : undefined;
	const title =
		conversation.kind === "system" ? t("friendRequests.notifications") : conversationTitle(conversation, personId);
	const unread = conversation.unreadCount;
	const selected = current === conversation.id || current === "main" ? conversation.id === primary : false;
	const visiting = conversation.visit?.role === "host" && conversation.visit.state === "pending";
	return (
		<ConversationRow
			actions={actions}
			leading={<ConversationAvatar conversation={conversation} personId={personId} />}
			title={
				peer?.kind === "bot" ? (
					<BotName
						name={title}
						ownedBot={ownedBotFor(peer.memberId, personId, bot ?? undefined, contacts)}
						owner={conversationBotOwner(peer, conversation)}
						compact="list"
					/>
				) : (
					title
				)
			}
			preview={rowPreview(conversation, t)}
			meta={
				conversation.lastMessage?.createdAt
					? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
							new Date(conversation.lastMessage.createdAt),
						)
					: undefined
			}
			badge={
				unread || conversation.muted || conversation.pinned || visiting ? (
					<span className="flex items-center gap-[var(--spacing-1)]">
						{visiting ? (
							<span className="rounded-[var(--radius-control-sm)] bg-[var(--color-danger-subtle)] px-[var(--spacing-1)] text-micro text-[var(--color-danger)]">
								{t("visits.waitingForYou")}
							</span>
						) : null}
						{conversation.pinned ? <Pin size={13} aria-label={t("messages.pinned")} /> : null}
						{conversation.muted ? <BellOff size={13} aria-label={t("messages.muted")} /> : null}
						<UnreadBadge count={unread} muted={conversation.muted} dot={mobile && conversation.id === primary} />
					</span>
				) : undefined
			}
			selected={selected}
			onClick={onOpen}
		/>
	);
}
