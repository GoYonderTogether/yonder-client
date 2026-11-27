import {
	conversationPeer,
	groupMessages,
	isConnectorIntakeCard,
	isSilentFailure,
	isTwoPartyAgentChat,
	optionCardState,
	ownedBotFor,
} from "@yonder/chat-model";
import { MessageRun, MessageTime } from "@yonder/chat-presentation";
import { FeishuAttemptCard } from "@yonder/feature-me";
import { BotName, systemEventText } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import type { CachedMessage } from "@yonder/ui-data";
import { resolveLocale } from "@yonder/ui-i18n";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { Copy, Forward, Quote, RotateCcw, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Fragment, useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "../app/app-notice.tsx";
import { ComposerQuoteContext } from "../app/composer-quote.tsx";
import { MessageEntry, type MessageEntryProps, RunFailureNotice } from "./conversation-message-entry.tsx";
import { DecoratedMessageEntry } from "./decorated-message-entry.tsx";
import { FriendRequestCard } from "./friend-request-card.tsx";
import { MemoryUpdatedLine } from "./memory-updated-line.tsx";
import { MessageContent } from "./message-content.tsx";
import { MessageMenu, type MessageMenuItem, type MessageMenuTarget, mentionMenuItem } from "./message-menu.tsx";
import { MessageQuote, quoteSnippet } from "./message-quote.tsx";
import { OutwardRequestCard } from "./outward-request-card.tsx";
import { SenderAvatar } from "./sender-avatar.tsx";

/** Sender identity belongs to a consecutive run, shared by text and attachment messages. */
export function ConversationMessages({
	items,
	hasFullHistory,
	conversation,
	person,
	bot,
	contacts,
	onOpenRelated,
	onOpenMember,
	onMention,
	messageActions,
	onJumpToQuote,
	...actions
}: Omit<MessageEntryProps, "message" | "self" | "optionReply" | "menuRows" | "onMenu"> & {
	items: CachedMessage[];
	hasFullHistory: boolean;
	conversation: Conversation;
	person?: Member | undefined;
	bot?: Member | undefined;
	contacts?: readonly Member[] | undefined;
	onOpenRelated?: (id: string) => void;
	/** A sender's avatar opens who they are, as in QQ and WeChat (profile-entry matrix 第二节). */
	onOpenMember?: ((memberId: string) => void) | undefined;
	onMention?: ((memberId: string, displayName: string) => void) | undefined;
	onJumpToQuote?: (id: string) => void;
	messageActions?: MessageActions;
	onRetry: (userMessageId: string) => void;
	retrying: boolean;
}) {
	const { t, i18n } = useTranslation();
	const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
	const notice = useAppNotice();
	const draft = useContext(ComposerQuoteContext);
	const ownedBotChat = isOwnedBotChat(conversation, person, bot, contacts);
	const senderName = (id: string) =>
		conversation.members.find((member) => member.memberId === id)?.displayName ||
		(id === person?.id ? person.displayName : id === bot?.id ? bot.displayName : undefined) ||
		contacts?.find((member) => member.id === id)?.displayName ||
		t("chat.unknownSender");
	const [menu, setMenu] = useState<MessageMenuTarget | null>(null);
	const closeMenu = useCallback(() => setMenu(null), []);
	const visitRole = conversation.visit?.role;
	const deviceFiles = Boolean(
		person &&
			!conversation.visit &&
			conversation.kind !== "system" &&
			conversation.members.some((member) => member.kind === "bot") &&
			conversation.members.every(
				(member) => member.memberId === person.id || ownedBotFor(member.memberId, person.id, bot, contacts),
			),
	);
	const showAvatars = !isTwoPartyAgentChat(conversation, person?.id);
	const optionCards = optionCardState(items, person?.id);
	const delivered = new Set(items.filter((item) => item.outwardRequest?.result).map((item) => item.replyToId));
	const drafts = new Map<string, string>();
	for (const item of items) {
		if (
			item.outwardDraft &&
			item.run?.status === "completed" &&
			item.replyToId &&
			item.body?.trim() &&
			item.body.length <= 8000
		)
			drafts.set(item.replyToId, item.body);
	}
	if (conversation.kind === "system")
		return items.map((message) => (
			<div key={message.id} data-message-id={message.id}>
				{message.friendRequestId ? (
					<FriendRequestCard id={message.friendRequestId} />
				) : message.body ? (
					<MessageContent body={message.body} />
				) : null}
			</div>
		));
	const visibleItems = delivered.size ? items.filter((item) => item.recalled || !delivered.has(item.id)) : items;
	const grouping = { agentCards: true, connectorIntakeOwnerLayout: true };
	// Keep a recalled message in the same timeline position, outside any sender run.
	const timeline = visibleItems.map((item): CachedMessage => (item.recalled ? { ...item, type: "system" } : item));
	const blocks = groupMessages(timeline, hasFullHistory, grouping).map((block) => {
		if ("time" in block)
			return (
				<MessageTime
					key={`time-${block.messageId}`}
					at={block.time}
					locale={locale}
					atStart={block.atStart}
					render={(text) => (
						<time
							dateTime={block.time.toISOString()}
							className="mx-auto text-center text-caption text-[var(--color-text-tertiary)]"
						>
							{text}
						</time>
					)}
				/>
			);
		const run = block.run;
		const first = run[0];
		if (!first) return null;
		if (first.recalled)
			return (
				<SystemLine
					key={first.id}
					message={first}
					recalledText={t(
						first.recalled.by === "owner" && first.senderId !== conversation.ownerId
							? "chat.recalledOwner"
							: first.senderId === person?.id
								? "chat.recalledSelf"
								: "chat.recalledSender",
						{ name: senderName(first.senderId) },
					)}
				/>
			);
		if (first.type === "system") return <SystemLine key={first.id} message={first} />;
		if (person && isConnectorIntakeCard(first)) {
			return (
				<MessageRun key={first.id} as="div" self senderId={first.senderId}>
					<MessageEntry message={first} self {...actions} personId={person.id} />
				</MessageRun>
			);
		}
		const self = first.senderId === person?.id;
		// A failed run is the chat's own fact, never a caption on a message: one centred system line
		// after the run, whether the reply wrote nothing or stopped partway. A silent failure draws no
		// bubble at all, so the line is the whole of what the owner sees for that turn.
		const spoken = run.filter((message) => !isSilentFailure(message));
		const notices = run
			.filter((message) => message.run?.status === "failed")
			.map((message) => (
				<RunFailureNotice
					key={message.id}
					message={message}
					repeats={block.repeats?.get(message.id)}
					retrying={actions.retrying}
					onRetry={actions.onRetry}
				/>
			));
		const peer = conversation.members.find((member) => member.memberId === first.senderId);
		const member = peer ?? (self ? person : first.senderId === bot?.id ? bot : undefined);
		const name = member?.displayName || t("chat.unknownSender");
		const mention =
			conversation.kind === "group" && !conversation.closedReason && person && !self && peer && onMention
				? () => onMention(peer.memberId, name)
				: undefined;
		const entries = spoken.map((message) => {
			if (message.friendRequestId) return <FriendRequestCard key={message.id} id={message.friendRequestId} />;
			if (message.channelAttemptId)
				return (
					<div key={message.id} data-message-id={message.id}>
						<FeishuAttemptCard id={message.channelAttemptId} />
					</div>
				);
			const request = message.outwardRequest;
			if (request) {
				const linked = request.owner?.visitConversationId ?? (visitRole === "host" ? MAIN_CONVERSATION : null);
				return (
					<div key={message.id} data-message-id={message.id}>
						<OutwardRequestCard
							card={request}
							conversationId={conversation.id}
							body={message.body}
							draft={drafts.get(message.id)}
							canCancel={visitRole === "visitor"}
							openLinked={linked && onOpenRelated ? () => onOpenRelated(linked) : undefined}
						/>
					</div>
				);
			}
			const menuContext = {
				conversation,
				personId: person?.id,
				ownedBotChat,
				mention,
				actions: messageActions,
				onQuote:
					draft?.conversationId === conversation.id
						? () =>
								draft.setQuote({
									senderName: senderName(message.senderId),
									replyTo: { id: message.id, senderId: message.senderId, snippet: quoteSnippet(message) },
								})
						: undefined,
				onCopied: (ok: boolean) =>
					notice({
						key: "message-menu-copy",
						text: t(ok ? "app.copied" : "landing.copyFailed"),
						tone: ok ? "info" : "error",
					}),
			};
			const replyTo = message.replyTo;
			return (
				<DecoratedMessageEntry
					key={message.id}
					message={message}
					self={self}
					{...actions}
					personId={person?.id}
					deviceFiles={deviceFiles}
					onChooseOption={message.id === optionCards.openId ? actions.onChooseOption : undefined}
					optionReply={optionCards.replies.get(message.id)}
					menuRows={messageMenuRows(message, t, menuContext)}
					{...(messageHasMenu(message)
						? {
								onMenu: (target: MessageMenuTarget) => {
									const rows = [
										...target.items.filter(({ id }) => id === "download"),
										...messageMenuRows(message, t, menuContext),
									];
									if (rows.length) setMenu({ ...target, items: rows });
								},
							}
						: {})}
					quote={
						replyTo ? (
							<MessageQuote replyTo={replyTo} senderName={senderName(replyTo.senderId)} onJump={onJumpToQuote} />
						) : null
					}
				/>
			);
		});
		if (!spoken.length) return <Fragment key={first.id}>{notices}</Fragment>;
		const owner = first.senderKind === "person" && first.senderId === conversation.ownerId;
		const face = (
			<Avatar
				name={name}
				src={member?.avatarUrl}
				color={member?.avatarColor}
				kind={member?.kind ?? first.senderKind}
				size={32}
			/>
		);
		const sender =
			conversation.kind === "group" ? (
				<span data-message-sender-header className="min-w-0 text-start text-caption text-[var(--color-text-secondary)]">
					{first.senderKind === "bot" ? (
						<BotName
							name={
								<span data-message-sender-name title={name} className="inline-block max-w-full align-top">
									{name}
								</span>
							}
							ownedBot={ownedBotFor(first.senderId, person?.id, bot, contacts)}
							owner={peer?.botOwner}
						/>
					) : owner ? (
						<span className="message-run-owner">
							<span data-message-sender-name title={name} className="message-run-name">
								{name}
							</span>
							<span data-message-group-owner className="message-run-owner-badge">
								{t("members.group.owner")}
							</span>
						</span>
					) : (
						<span data-message-sender-name title={name} className="message-run-name">
							{name}
						</span>
					)}
				</span>
			) : null;
		const profile =
			showAvatars && member && onOpenMember ? (
				<SenderAvatar
					name={name}
					face={face}
					sender={sender}
					onOpen={() => onOpenMember(first.senderId)}
					onMention={mention}
					onMenu={setMenu}
				/>
			) : null;
		return (
			<Fragment key={first.id}>
				<MessageRun
					as="div"
					self={self}
					senderId={first.senderId}
					avatar={showAvatars && !(profile && sender) ? (profile ?? face) : null}
					sender={profile ? null : sender}
					identity={sender ? profile : null}
				>
					{entries}
				</MessageRun>
				{notices}
			</Fragment>
		);
	});
	return (
		<>
			{blocks}
			{menu ? <MessageMenu target={menu} onClose={closeMenu} /> : null}
		</>
	);
}

type MessageActions = {
	forward: (message: CachedMessage) => void;
	feedback: (message: CachedMessage, value: "up" | "down" | null) => void;
	recall: (message: CachedMessage) => void;
	delete: (message: CachedMessage) => void;
};

export function isOwnedBotChat(
	conversation: Conversation,
	person: Member | undefined,
	bot: Member | undefined,
	contacts: readonly Member[] | undefined,
) {
	if (!person || conversation.kind !== "direct" || conversation.visit) return false;
	const peer = conversationPeer(conversation, person.id);
	return Boolean(
		peer?.kind === "bot" &&
			(peer.botOwner?.handle === person.handle || ownedBotFor(peer.memberId, person.id, bot, contacts)),
	);
}

function messageHasMenu(message: CachedMessage) {
	return (
		message.type === "text" &&
		!message.recalled &&
		!message.streaming &&
		!message.pending &&
		!message.questionCard &&
		!message.options?.length &&
		!message.sendFailed &&
		message.run?.status !== "failed" &&
		!message.scheduleNotice &&
		!message.burstNotice
	);
}

export function messageMenuRows(
	message: CachedMessage,
	t: (key: string) => string,
	{
		conversation,
		personId,
		ownedBotChat,
		mention,
		onCopied,
		onQuote,
		actions,
		now = Date.now(),
	}: {
		conversation: Conversation;
		personId: string | undefined;
		ownedBotChat: boolean;
		mention?: (() => void) | undefined;
		onCopied: (ok: boolean) => void;
		onQuote?: (() => void) | undefined;
		actions?: MessageActions | undefined;
		now?: number;
	},
): MessageMenuItem[] {
	if (!messageHasMenu(message) || conversation.kind === "system") return [];
	const rows: MessageMenuItem[] = [];
	const body = message.body;
	if (body?.trim())
		rows.push({
			id: "copy",
			label: t("app.copy"),
			icon: <Copy size={16} />,
			run: () =>
				void (async () => {
					try {
						await navigator.clipboard.writeText(body);
						onCopied(true);
					} catch {
						onCopied(false);
					}
				})(),
		});
	if (onQuote) rows.push({ id: "quote", label: t("chat.quote"), icon: <Quote size={16} />, run: onQuote });
	if (
		actions &&
		!message.cardId &&
		!message.connectorRequestId &&
		!message.meeting &&
		!message.taskSession &&
		!message.outwardRequest &&
		!message.channelAttemptId &&
		!message.friendRequestId &&
		!message.connectorIntake
	)
		rows.push({
			id: "forward",
			label: t("chat.forward"),
			icon: <Forward size={16} />,
			run: () => actions.forward(message),
		});
	if (mention) rows.push(mentionMenuItem(t("chat.mentionTa"), mention));
	if (!actions || !personId) return rows;
	if (message.senderKind === "bot")
		rows.push(
			{
				id: "like",
				label: t(message.feedback === "up" ? "chat.cancelLike" : "chat.like"),
				icon: <ThumbsUp size={16} />,
				run: () => actions.feedback(message, message.feedback === "up" ? null : "up"),
			},
			{
				id: "dislike",
				label: t(message.feedback === "down" ? "chat.cancelDislike" : "chat.dislike"),
				icon: <ThumbsDown size={16} />,
				run: () => actions.feedback(message, message.feedback === "down" ? null : "down"),
			},
		);
	const humanChat = conversation.kind === "group" || conversationPeer(conversation, personId)?.kind === "person";
	const owner = conversation.kind === "group" && conversation.ownerId === personId;
	const ownRecentMessage = message.senderId === personId && now - Date.parse(message.createdAt) < 5 * 60_000;
	if (!conversation.visit && humanChat && (owner || ownRecentMessage))
		rows.push({
			id: "recall",
			label: t("chat.recall"),
			icon: <RotateCcw size={16} />,
			run: () => actions.recall(message),
		});
	rows.push({
		id: "delete",
		label: t(ownedBotChat ? "chat.deleteMessage" : "chat.deleteMessageForMe"),
		icon: <Trash2 size={16} />,
		run: () => actions.delete(message),
	});
	return rows;
}

/**
 * One group lifecycle event, drawn the way every chat app draws it: a muted centred line with no
 * bubble, avatar or actions (19 3.3). The sentence comes from the stored event, so the same row
 * reads correctly in Chinese and in English, and an event nothing can be said about stays out.
 */
function SystemLine({ message, recalledText }: { message: CachedMessage; recalledText?: string }) {
	const { t } = useTranslation();
	if (!recalledText && message.system?.event === "memory_updated")
		return <MemoryUpdatedLine messageId={message.id} event={message.system} />;
	const text = recalledText ?? (message.system ? systemEventText(message.system, t) : "");
	if (!text) return null;
	return (
		<p
			key={message.id}
			data-message-id={message.id}
			data-message-system
			role="note"
			className="mx-auto max-w-full px-[var(--spacing-4)] text-center text-caption wrap-anywhere text-[var(--color-text-tertiary)]"
		>
			{text}
		</p>
	);
}
