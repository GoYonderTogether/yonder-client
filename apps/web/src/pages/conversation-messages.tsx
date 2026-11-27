import {
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
import { Copy } from "lucide-react";
import { Fragment, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "../app/app-notice.tsx";
import { MessageEntry, type MessageEntryProps, RunFailureNotice } from "./conversation-message-entry.tsx";
import { FriendRequestCard } from "./friend-request-card.tsx";
import { MemoryUpdatedLine } from "./memory-updated-line.tsx";
import { MessageContent } from "./message-content.tsx";
import { MessageMenu, type MessageMenuItem, type MessageMenuTarget, mentionMenuItem } from "./message-menu.tsx";
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
	onRetry: (userMessageId: string) => void;
	retrying: boolean;
}) {
	const { t, i18n } = useTranslation();
	const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
	const notice = useAppNotice();
	const [menu, setMenu] = useState<MessageMenuTarget | null>(null);
	const closeMenu = useCallback(() => setMenu(null), []);
	const visitRole = conversation.visit?.role;
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
	const visibleItems = delivered.size ? items.filter((item) => !delivered.has(item.id)) : items;
	const grouping = { agentCards: true, connectorIntakeOwnerLayout: true };
	const blocks = groupMessages(visibleItems, hasFullHistory, grouping).map((block) => {
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
			return (
				<MessageEntry
					key={message.id}
					message={message}
					self={self}
					{...actions}
					personId={person?.id}
					onChooseOption={message.id === optionCards.openId ? actions.onChooseOption : undefined}
					optionReply={optionCards.replies.get(message.id)}
					menuRows={messageMenuRows(message, t, mention, (ok) =>
						notice({
							key: "message-menu-copy",
							text: t(ok ? "app.copied" : "landing.copyFailed"),
							tone: ok ? "info" : "error",
						}),
					)}
					onMenu={setMenu}
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

function messageMenuRows(
	message: CachedMessage,
	t: (key: string) => string,
	mention: (() => void) | undefined,
	onCopied: (ok: boolean) => void,
): MessageMenuItem[] {
	if (message.questionCard || message.options?.length || message.sendFailed || message.run?.status === "failed")
		return [];
	const items: MessageMenuItem[] = [];
	const body = message.body;
	if (body?.trim())
		items.push({
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
	if (mention) items.push(mentionMenuItem(t("chat.mentionTa"), mention));
	return items;
}

/**
 * One group lifecycle event, drawn the way every chat app draws it: a muted centred line with no
 * bubble, avatar or actions (19 3.3). The sentence comes from the stored event, so the same row
 * reads correctly in Chinese and in English, and an event nothing can be said about stays out.
 */
function SystemLine({ message }: { message: CachedMessage }) {
	const { t } = useTranslation();
	if (message.system?.event === "memory_updated")
		return <MemoryUpdatedLine messageId={message.id} event={message.system} />;
	const text = message.system ? systemEventText(message.system, t) : "";
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
