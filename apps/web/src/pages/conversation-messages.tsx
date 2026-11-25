import {
	groupMessages,
	isConnectorIntakeCard,
	isSilentFailure,
	optionCardState,
	ownedBotFor,
} from "@yonder/chat-model";
import { MessageRun, MessageTime } from "@yonder/chat-presentation";
import { FeishuAttemptCard } from "@yonder/feature-me";
import { BotName, systemEventText } from "@yonder/feature-members";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import { type CachedMessage, useAccountTimeZone } from "@yonder/ui-data";
import { resolveLocale } from "@yonder/ui-i18n";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import type { TFunction } from "i18next";
import { AtSign } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { MessageEntry, type MessageEntryProps, RunFailureNotice } from "./conversation-message-entry.tsx";
import { FriendRequestCard } from "./friend-request-card.tsx";
import { MemoryUpdatedLine } from "./memory-updated-line.tsx";
import { MessageContent } from "./message-content.tsx";
import { AskOwner, OutwardRequestCard } from "./outward-request-card.tsx";
import { SenderAvatar } from "./sender-avatar.tsx";

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
}: Omit<MessageEntryProps, "message" | "self" | "optionReply"> & {
	items: CachedMessage[];
	hasFullHistory: boolean;
	conversation: Conversation;
	person?: Member | undefined;
	bot?: Member | undefined;
	contacts?: readonly Member[] | undefined;
	onOpenRelated?: (id: string) => void;
	/** A sender's avatar opens who they are, as in QQ and WeChat (profile-entry matrix 第二节). */
	onOpenMember?: ((memberId: string) => void) | undefined;
	/** Puts `@name ` in the composer for that sender; the frame routes it through the draft's bindings. */
	onMention?: ((memberId: string, displayName: string) => void) | undefined;
}) {
	const { t, i18n } = useTranslation();
	const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
	const zone = useAccountTimeZone();
	const visitRole = conversation.visit?.role;
	const optionCards = optionCardState(items, person?.id);
	const asks = new Set(items.filter((item) => item.outwardRequest && item.replyToId).map((item) => item.replyToId));
	const hasOpen = items.some((item) => item.outwardRequest?.state === "open");
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
	const askable =
		visitRole === "visitor" && conversation.visit?.state !== "denied"
			? items.findLast((item) => item.senderId === person?.id && !item.pending && !item.sendFailed && item.body?.trim())
			: null;
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
	return groupMessages(visibleItems, hasFullHistory, grouping, zone).map((block) => {
		if ("time" in block)
			return (
				<MessageTime
					key={`time-${block.messageId}`}
					at={block.time}
					zone={zone}
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
			if (message.id !== askable?.id || asks.has(message.id) || hasOpen)
				return (
					<MessageEntry
						key={message.id}
						message={message}
						self={self}
						{...actions}
						personId={person?.id}
						onChooseOption={message.id === optionCards.openId ? actions.onChooseOption : undefined}
						optionReply={optionCards.replies.get(message.id)}
					/>
				);
			return (
				<div key={message.id} className={self ? "flex flex-col items-end" : "min-w-0"}>
					<MessageEntry message={message} self={self} {...actions} personId={person?.id} />
					<AskOwner messageId={message.id} conversationId={conversation.id} disabled={actions.disconnected} />
				</div>
			);
		});
		if (!spoken.length) return <Fragment key={first.id}>{notices}</Fragment>;
		const peer = conversation.members.find((member) => member.memberId === first.senderId);
		const member = peer ?? (self ? person : first.senderId === bot?.id ? bot : undefined);
		const name = member?.displayName || t("chat.unknownSender");
		const owner = first.senderKind === "person" && first.senderId === conversation.ownerId;
		// Both sides carry the sender's avatar (the founder's 11-25 rule): the other side on the left,
		// the owner on the right, one face per run, exactly as the run already groups messages.
		const face = (
			<Avatar
				name={name}
				src={member?.avatarUrl}
				color={member?.avatarColor}
				kind={member?.kind ?? first.senderKind}
				size={32}
			/>
		);
		// One hit area for who the sender is: the avatar, the name and a Bot's tag all open the same
		// profile (Slack, Telegram do the same), and @ has its own control so a click never does both.
		const profile = onOpenMember ? () => onOpenMember(first.senderId) : undefined;
		const label = t("members.openOwner", { name });
		const hit =
			"m-0 border-0 bg-transparent p-0 rounded-[var(--radius-control-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
		const mentionable = conversation.kind === "group" && !self && Boolean(onMention);
		const senderName = (
			<SenderName
				name={name}
				owner={owner}
				t={t}
				bot={
					first.senderKind === "bot"
						? { ownedBot: ownedBotFor(first.senderId, person?.id, bot, contacts), owner: peer?.botOwner }
						: undefined
				}
			/>
		);
		return (
			<Fragment key={first.id}>
				<MessageRun
					as="div"
					self={self}
					senderId={first.senderId}
					avatar={
						profile ? (
							<SenderAvatar
								label={label}
								mentionLabel={mentionable ? t("chat.mentionAvatar", { name }) : undefined}
								onOpen={profile}
								onMention={mentionable ? () => onMention?.(first.senderId, name) : undefined}
							>
								{face}
							</SenderAvatar>
						) : (
							face
						)
					}
					sender={
						conversation.kind === "group" ? (
							<div
								data-message-sender-header
								className={`flex min-w-0 items-center gap-[var(--spacing-1)] text-start text-caption text-[var(--color-text-secondary)] ${self ? "justify-end" : ""}`}
							>
								{profile ? (
									<button type="button" aria-label={label} onClick={profile} className={`min-w-0 text-start ${hit}`}>
										{senderName}
									</button>
								) : (
									senderName
								)}
								{mentionable ? (
									<button
										type="button"
										data-message-mention={first.senderId}
										aria-label={t("chat.mention", { name })}
										title={t("chat.mention", { name })}
										onClick={() => onMention?.(first.senderId, name)}
										className="message-mention relative flex h-[var(--spacing-5)] w-[var(--spacing-5)] shrink-0 items-center justify-center rounded-[var(--radius-full)] text-[var(--color-text-secondary)] after:absolute after:-inset-[var(--spacing-1)] after:content-[''] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
									>
										<AtSign size={14} aria-hidden="true" />
									</button>
								) : null}
							</div>
						) : null
					}
				>
					{entries}
				</MessageRun>
				{notices}
			</Fragment>
		);
	});
}

/** The sender's name above the message column: a Bot keeps its tag, the owner keeps the badge. */
function SenderName({
	name,
	owner,
	bot,
	t,
}: {
	name: string;
	owner: boolean;
	bot: { ownedBot: Member | undefined; owner: ConversationMember["botOwner"] } | undefined;
	t: TFunction;
}) {
	if (bot)
		return (
			<BotName
				name={
					<span data-message-sender-name title={name} className="inline-block max-w-full align-top">
						{name}
					</span>
				}
				ownedBot={bot.ownedBot}
				owner={bot.owner}
			/>
		);
	if (owner)
		return (
			<span className="message-run-owner">
				<span data-message-sender-name title={name} className="message-run-name">
					{name}
				</span>
				<span data-message-group-owner className="message-run-owner-badge">
					{t("members.group.owner")}
				</span>
			</span>
		);
	return (
		<span data-message-sender-name title={name} className="message-run-name">
			{name}
		</span>
	);
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
