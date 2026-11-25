import {
	attachmentsOutsideQuestionCard,
	groupMessages,
	isConnectorIntakeCard,
	isSilentFailure,
	isTwoPartyAgentChat,
	optionCardAttachments,
	optionCardState,
	ownedBotFor,
	runFailureText,
	scheduleFailureText,
} from "@yonder/chat-model";
import { MessageBubble, MessageRun, MessageTime, SystemNotice } from "@yonder/chat-presentation";
import { FeishuAttemptCard } from "@yonder/feature-me";
import { BotName, systemEventText } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { Avatar, Button } from "@yonder/ui-components";
import { type CachedMessage, useAccountTimeZone } from "@yonder/ui-data";
import { resolveLocale } from "@yonder/ui-i18n";
import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { AgentCardMessage } from "./agent-card-message.tsx";
import { ConnectorIntakeMessageCard } from "./connector-intake-card.tsx";
import { ConnectorRequestCard } from "./connector-request-card.tsx";
import { FriendRequestCard } from "./friend-request-card.tsx";
import { MeetingMessageCard } from "./meeting-message-card.tsx";
import { MemoryUpdatedLine } from "./memory-updated-line.tsx";
import { MessageAttachments } from "./message-attachments.tsx";
import { MessageContent } from "./message-content.tsx";
import { MessageOptions } from "./message-options.tsx";
import { MessageSources } from "./message-sources.tsx";
import { AskOwner, OutwardRequestCard } from "./outward-request-card.tsx";
import { QuestionCard } from "./question-card.tsx";
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
	personId?: string | undefined;
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
	const zone = useAccountTimeZone();
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
			<Fragment key={first.id}>
				<MessageRun
					as="div"
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
	onOpenMeeting,
	onChooseOption,
	optionReply,
	personId,
}: MessageProps) {
	const { t } = useTranslation();
	const { attachments, images } = optionCardAttachments(message);
	const attachment = attachments[0];
	const voice = attachment && attachments.every(({ kind }) => kind === "audio") ? message.voice : undefined;
	const question = message.questionCard;
	// A question card's own images are drawn inside the card; only the rest sit beside the bubble.
	const ordinaryAttachments = question ? attachmentsOutsideQuestionCard(message) : attachments;
	const meeting = message.meeting;
	return (
		<article
			key={message.id}
			data-message-id={message.id}
			data-message-sender={self ? "self" : "other"}
			className={`flex min-w-0 flex-col gap-[var(--spacing-1)] ${self ? "items-end" : "items-start"}`}
		>
			{message.outwardDraft ? <p className="text-caption">{t("visits.relayPrivateDraft")}</p> : null}
			{question ? (
				<QuestionCard
					id={message.id}
					conversationId={message.conversationId}
					personId={personId}
					card={question}
					attachments={message.attachments}
					disconnected={disconnected}
				/>
			) : message.options?.length ? (
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
				<VoiceMessage
					key={attachment.id}
					attachment={attachment}
					additional={attachments.slice(1)}
					durationMs={voice.durationMs}
					self={self}
				/>
			) : message.body?.trim() || (message.streaming && message.senderKind !== "bot") ? (
				<MessageBubble as="div" self={self}>
					{message.questionReply?.question ? (
						<blockquote className="m-0 mb-[var(--spacing-2)] whitespace-pre-wrap break-words border-s border-[var(--color-border-subtle)] ps-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
							{message.questionReply.question}
						</blockquote>
					) : null}
					{message.body ? (
						message.questionReply ? (
							<span className="whitespace-pre-wrap break-words">{message.body}</span>
						) : (
							<MessageContent body={message.body} streaming={message.streaming} />
						)
					) : (
						<span role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t(disconnected ? "chat.reconnectingReply" : "chat.streaming")}
						</span>
					)}
				</MessageBubble>
			) : null}
			{voice?.transcription === "pending" ? (
				<span role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t("chat.transcribing")}
				</span>
			) : null}
			{voice ? null : <MessageAttachments attachments={ordinaryAttachments} self={self} />}
			{message.reaction ? <span>{message.reaction}</span> : null}
			<MessageSources run={message.run} />
			{message.connectorRequestId ? <ConnectorRequestCard id={message.connectorRequestId} /> : null}
			{message.cardId ? <AgentCardMessage id={message.cardId} disconnected={disconnected} /> : null}
			{meeting && onOpenMeeting ? <MeetingMessageCard meeting={meeting} onOpen={onOpenMeeting} /> : null}
			{message.taskSession && onOpenMeeting && !message.connectorIntake ? (
				<MeetingMessageCard meeting={message.taskSession} task onOpen={onOpenMeeting} />
			) : null}
			{/* A connector's entry is one card: the import's own facts, which also open the session. */}
			{message.connectorIntake ? (
				<ConnectorIntakeMessageCard
					intake={message.connectorIntake}
					{...(message.taskSession ? { sessionId: message.taskSession.id } : {})}
					{...(onOpenMeeting ? { onOpen: onOpenMeeting } : {})}
				/>
			) : null}
			{message.pending ? (
				<span className="text-caption text-[var(--color-text-secondary)]">{t("chat.sending")}</span>
			) : null}
			{message.sendFailed ? (
				<SystemNotice
					as="div"
					tone="quiet"
					role="alert"
					action={
						<Button variant="link" size="sm" onClick={() => onResend(message)}>
							{t("app.retry")}
						</Button>
					}
				>
					{t("chat.sendFailed")}
				</SystemNotice>
			) : null}
			{message.scheduleNotice ? <ScheduleFailureNotice notice={message.scheduleNotice} /> : null}
			{message.burstNotice ? (
				<SystemNotice as="div" tone="quiet" role="note">
					{t("chat.subtaskBurst")}
				</SystemNotice>
			) : null}
		</article>
	);
}

/**
 * A failed reply as one system line, never a bubble: a quota refusal names the pool that ran out so
 * the reader knows what to top up; everything else is one short sentence with no reason code. A
 * reply that said nothing is already replaced by this line, so it carries no bubble of its own.
 */
function RunFailureNotice({
	message,
	repeats,
	retrying,
	onRetry,
}: {
	message: CachedMessage;
	repeats: number | undefined;
	retrying: boolean;
	onRetry: (userMessageId: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
	const notice = runFailureText(message.run?.failureReason, locale);
	const canRetry = !message.outwardDraft && message.run?.canRetry !== false;
	return (
		<SystemNotice
			as="div"
			tone={notice.tone}
			role="alert"
			messageId={message.id}
			action={
				canRetry ? (
					<Button variant="link" size="sm" onClick={() => onRetry(message.run?.userMessageId ?? "")} loading={retrying}>
						{t("app.retry")}
					</Button>
				) : null
			}
		>
			{notice.text}
			{repeats && repeats > 1 ? ` · ${t("chat.failureRepeats", { count: repeats })}` : ""}
		</SystemNotice>
	);
}

/** A plan that never ran: the same system line, with the plan's own title. */
function ScheduleFailureNotice({ notice }: { notice: { title: string; reason: string } }) {
	const { i18n } = useTranslation();
	const failure = scheduleFailureText(
		notice.reason,
		notice.title,
		resolveLocale(i18n.resolvedLanguage ?? i18n.language),
	);
	return (
		<SystemNotice as="div" tone={failure.tone} role="alert">
			{failure.text}
		</SystemNotice>
	);
}
