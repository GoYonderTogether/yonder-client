import {
	groupMessages,
	isTwoPartyAgentChat,
	optionCardAttachments,
	optionCardState,
	ownedBotFor,
} from "@yonder/chat-model";
import { MessageBubble, MessageRun, MessageTime } from "@yonder/chat-presentation";
import { FeishuAttemptCard } from "@yonder/feature-me";
import { BotName, systemEventText } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { Avatar, Button } from "@yonder/ui-components";
import type { CachedMessage } from "@yonder/ui-data";
import { resolveLocale } from "@yonder/ui-i18n";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { AgentCardMessage } from "./agent-card-message.tsx";
import { ConnectorRequestCard } from "./connector-request-card.tsx";
import { FriendRequestCard } from "./friend-request-card.tsx";
import { MeetingMessageCard } from "./meeting-message-card.tsx";
import { MemoryUpdatedLine } from "./memory-updated-line.tsx";
import { MessageAttachments } from "./message-attachments.tsx";
import { MessageContent } from "./message-content.tsx";
import { MessageOptions } from "./message-options.tsx";
import { MessageSources } from "./message-sources.tsx";
import { AskOwner, OutwardRequestCard } from "./outward-request-card.tsx";
import { VoiceMessage } from "./voice-message.tsx";

interface MessageProps {
	message: CachedMessage;
	self: boolean;
	disconnected: boolean;
	onResend: (message: CachedMessage) => void;
	onRetry: (userMessageId: string) => void;
	retrying: boolean;
	onOpenMeeting?: (id: string) => void;
	onChooseOption?: ((body: string, cardId: string) => void) | undefined;
	optionReply?: CachedMessage | undefined;
}

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
	...actions
}: Omit<MessageProps, "message" | "self" | "optionReply"> & {
	items: CachedMessage[];
	hasFullHistory: boolean;
	conversation: Conversation;
	person?: Member | undefined;
	bot?: Member | undefined;
	contacts?: readonly Member[] | undefined;
	onOpenRelated?: (id: string) => void;
	/** A sender's avatar opens who they are, as in QQ and WeChat (profile-entry matrix 第二节). */
	onOpenMember?: ((memberId: string) => void) | undefined;
}) {
	const { t, i18n } = useTranslation();
	const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
	const visitRole = conversation.visit?.role;
	const showAvatars = !isTwoPartyAgentChat(conversation, person?.id);
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
	return groupMessages(visibleItems, hasFullHistory, { agentCards: true }).map((block) => {
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
		const self = first.senderId === person?.id;
		const entries = run.map((message) => {
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
						onChooseOption={message.id === optionCards.openId ? actions.onChooseOption : undefined}
						optionReply={optionCards.replies.get(message.id)}
					/>
				);
			return (
				<div key={message.id} className={self ? "flex flex-col items-end" : "min-w-0"}>
					<MessageEntry message={message} self={self} {...actions} />
					<AskOwner messageId={message.id} conversationId={conversation.id} disabled={actions.disconnected} />
				</div>
			);
		});
		const peer = conversation.members.find((member) => member.memberId === first.senderId);
		const member = peer ?? (self ? person : first.senderId === bot?.id ? bot : undefined);
		const name = member?.displayName || t("chat.unknownSender");
		const face = (
			<Avatar
				name={name}
				src={member?.avatarUrl}
				color={member?.avatarColor}
				kind={member?.kind ?? first.senderKind}
				size={32}
			/>
		);
		return (
			<MessageRun
				as="div"
				key={first.id}
				self={self}
				senderId={first.senderId}
				avatar={
					showAvatars ? (
						member && onOpenMember ? (
							<button
								type="button"
								aria-label={t("members.openOwner", { name })}
								onClick={() => onOpenMember(first.senderId)}
								className="rounded-[var(--radius-full)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
							>
								{face}
							</button>
						) : (
							face
						)
					) : null
				}
				sender={
					conversation.kind === "group" ? (
						<div data-message-sender-header className="text-start text-caption text-[var(--color-text-secondary)]">
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
							) : (
								<span data-message-sender-name title={name} className="message-run-name">
									{name}
								</span>
							)}
						</div>
					) : null
				}
			>
				{entries}
			</MessageRun>
		);
	});
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

function MessageEntry({
	message,
	self,
	disconnected,
	onResend,
	onRetry,
	retrying,
	onOpenMeeting,
	onChooseOption,
	optionReply,
}: MessageProps) {
	const { t } = useTranslation();
	const { attachments, images } = optionCardAttachments(message);
	const attachment = attachments.length === 1 ? attachments[0] : undefined;
	const voice = attachment?.kind === "audio" ? message.voice : undefined;
	const meeting = message.meeting;
	return (
		<article
			key={message.id}
			data-message-id={message.id}
			data-message-sender={self ? "self" : "other"}
			className={`flex min-w-0 flex-col gap-[var(--spacing-1)] ${self ? "items-end" : "items-start"}`}
		>
			{message.outwardDraft ? <p className="text-caption">{t("visits.relayPrivateDraft")}</p> : null}
			{message.options?.length ? (
				<MessageOptions
					question={message.body}
					options={message.options}
					images={images}
					selected={optionReply && !optionReply.pending && !optionReply.sendFailed ? optionReply.body : null}
					onChoose={
						!disconnected && !optionReply && onChooseOption ? (body) => onChooseOption(body, message.id) : undefined
					}
				/>
			) : voice && attachment ? (
				<VoiceMessage key={attachment.id} attachment={attachment} durationMs={voice.durationMs} self={self} />
			) : message.body?.trim() || (message.streaming && message.senderKind !== "bot") ? (
				<MessageBubble as="div" self={self}>
					{message.body ? (
						<MessageContent body={message.body} streaming={message.streaming} />
					) : (
						<span role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t(disconnected ? "chat.reconnectingReply" : "chat.streaming")}
						</span>
					)}
				</MessageBubble>
			) : null}
			{voice ? null : <MessageAttachments attachments={attachments} self={self} />}
			{message.reaction ? <span>{message.reaction}</span> : null}
			<MessageSources run={message.run} />
			{message.connectorRequestId ? <ConnectorRequestCard id={message.connectorRequestId} /> : null}
			{message.cardId ? <AgentCardMessage id={message.cardId} disconnected={disconnected} /> : null}
			{meeting && onOpenMeeting ? <MeetingMessageCard meeting={meeting} onOpen={onOpenMeeting} /> : null}
			{message.taskSession && onOpenMeeting ? (
				<MeetingMessageCard meeting={message.taskSession} task onOpen={onOpenMeeting} />
			) : null}
			{message.pending ? (
				<span className="text-caption text-[var(--color-text-secondary)]">{t("chat.sending")}</span>
			) : null}
			{message.sendFailed ? (
				<div role="alert" className="flex items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{t("chat.sendFailed")}{" "}
					<Button variant="link" size="sm" onClick={() => onResend(message)}>
						{t("app.retry")}
					</Button>
				</div>
			) : null}
			{message.run?.status === "failed" ? (
				<div role="alert" className="flex items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{t(runFailureKey(message.run.failureReason))}{" "}
					{!message.outwardDraft && message.run.canRetry !== false ? (
						<Button
							variant="link"
							size="sm"
							onClick={() => onRetry(message.run?.userMessageId ?? "")}
							loading={retrying}
						>
							{t("app.retry")}
						</Button>
					) : null}
				</div>
			) : null}
			{message.scheduleNotice ? (
				<div role="alert" className="flex items-center gap-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{t(scheduleFailureKey(message.scheduleNotice.reason), { title: message.scheduleNotice.title })}
				</div>
			) : null}
			{message.burstNotice ? (
				<div role="alert" className="text-caption text-[var(--color-danger)]">
					{t("chat.subtaskBurst")}
				</div>
			) : null}
		</article>
	);
}

/**
 * A failed run says why. A quota refusal names the pool that ran out, so the reader knows which
 * balance to top up rather than seeing a generic failure.
 */
function runFailureKey(reason: string | null | undefined): string {
	switch (reason) {
		case "model_not_configured":
			return "chat.modelNotConfigured";
		case "main_quota_exhausted":
			return "chat.quotaMainExhausted";
		case "background_quota_exhausted":
		case "background_quota_floor":
			return "chat.quotaBackgroundExhausted";
		case "coding_quota_exhausted":
		case "coding_quota_floor":
			return "chat.quotaCodingExhausted";
		case "external_quota_exhausted":
			return "chat.quotaExternalExhausted";
		case "tools_quota_exhausted":
			return "chat.quotaToolsExhausted";
		case "idle_timeout":
			return "chat.idleTimeout";
		case "tool_repeat":
			return "chat.toolRepeat";
		case "subtask_burst":
			return "chat.subtaskBurst";
		default:
			return "chat.runFailed";
	}
}

/** A scheduled run that never happened says which plan and why; the reason is the server's own. */
function scheduleFailureKey(reason: string): string {
	switch (reason) {
		case "background_quota_exhausted":
		case "background_quota_floor":
			return "chat.quotaBackgroundExhausted";
		case "schedule_missed":
			return "chat.scheduleMissed";
		case "idle_timeout":
			return "chat.idleTimeout";
		case "tool_repeat":
			return "chat.toolRepeat";
		case "subtask_burst":
			return "chat.subtaskBurst";
		default:
			return "chat.scheduleFailed";
	}
}
