import {
	attachmentsOutsideQuestionCard,
	optionCardAttachments,
	runFailureText,
	scheduleFailureText,
} from "@yonder/chat-model";
import { MessageBubble, SystemNotice } from "@yonder/chat-presentation";
import { Button } from "@yonder/ui-components";
import type { CachedMessage } from "@yonder/ui-data";
import { resolveLocale } from "@yonder/ui-i18n";
import { useTranslation } from "react-i18next";
import { AgentCardMessage } from "./agent-card-message.tsx";
import { ConnectorIntakeMessageCard } from "./connector-intake-card.tsx";
import { ConnectorRequestCard } from "./connector-request-card.tsx";
import { MeetingMessageCard } from "./meeting-message-card.tsx";
import { getAttachmentDownloadItem, MessageAttachments } from "./message-attachments.tsx";
import { MessageContent } from "./message-content.tsx";
import type { MessageMenuItem, MessageMenuTarget } from "./message-menu.tsx";
import { MessageOptions } from "./message-options.tsx";
import { MessageSources } from "./message-sources.tsx";
import { QuestionCard } from "./question-card.tsx";
import { useLongPress } from "./use-long-press.ts";
import { VoiceMessage } from "./voice-message.tsx";

export interface MessageEntryProps {
	message: CachedMessage;
	self: boolean;
	disconnected: boolean;
	onResend: (message: CachedMessage) => void;
	onOpenMeeting?: (id: string) => void;
	onChooseOption?: ((body: string, cardId: string) => void) | undefined;
	optionReply?: CachedMessage | undefined;
	personId?: string | undefined;
	menuRows?: readonly MessageMenuItem[] | undefined;
	onMenu?: (target: MessageMenuTarget) => void;
}

function isInteractiveMessagePart(target: EventTarget) {
	// An attachment tile is a button, but pressing it is how its own download row is reached.
	if (target instanceof Element && target.closest("[data-attachment-id]")) return false;
	return (
		target instanceof Element &&
		Boolean(
			target.closest("a, button, input, textarea, select, [role=button], [contenteditable], img, .message-attachments"),
		)
	);
}

export function MessageEntry({
	message,
	self,
	disconnected,
	onResend,
	onOpenMeeting,
	onChooseOption,
	optionReply,
	personId,
	menuRows,
	onMenu,
}: MessageEntryProps) {
	const { t } = useTranslation();
	const { attachments, images } = optionCardAttachments(message);
	const attachment = attachments[0];
	const voice = attachment && attachments.every(({ kind }) => kind === "audio") ? message.voice : undefined;
	const question = message.questionCard;
	// A question card's own images are drawn inside the card; only the rest sit beside the bubble.
	const ordinaryAttachments = question ? attachmentsOutsideQuestionCard(message) : attachments;
	const meeting = message.meeting;
	// An attachment's own long press or right-click offers its download row, so a message with no text still opens a menu.
	const attachmentMenu =
		Boolean(onMenu) &&
		!question &&
		!message.options?.length &&
		!message.sendFailed &&
		!voice &&
		ordinaryAttachments.length > 0;
	const menuEnabled = Boolean(onMenu) && (Boolean(menuRows?.length) || attachmentMenu);
	const { handlers, pressed } = useLongPress(
		menuEnabled && onMenu
			? (point) => {
					const download = attachmentMenu ? getAttachmentDownloadItem(point.target) : undefined;
					const items = [...(download ? [download] : []), ...(menuRows ?? [])];
					if (items.length) onMenu({ ...point, items });
				}
			: undefined,
		isInteractiveMessagePart,
	);
	return (
		<article
			key={message.id}
			data-message-id={message.id}
			data-message-sender={self ? "self" : "other"}
			data-long-press={pressed || undefined}
			aria-haspopup={menuEnabled ? "menu" : undefined}
			tabIndex={menuEnabled ? 0 : undefined}
			{...handlers}
			className={`flex min-w-0 flex-col gap-[var(--spacing-1)] rounded-[var(--radius-control-sm)] ${menuEnabled ? "[@media(pointer:coarse)]:[&>.message-bubble]:select-none" : ""} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] ${pressed ? "bg-[var(--color-bg-hover)] [&>.message-bubble]:bg-[var(--color-bg-hover)]!" : ""} ${self ? "items-end" : "items-start"}`}
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
export function RunFailureNotice({
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
