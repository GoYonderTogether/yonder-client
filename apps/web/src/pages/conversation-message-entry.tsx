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
import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { AgentCardMessage } from "./agent-card-message.tsx";
import { ConnectorIntakeMessageCard } from "./connector-intake-card.tsx";
import { ConnectorRequestCard } from "./connector-request-card.tsx";
import { MeetingMessageCard } from "./meeting-message-card.tsx";
import { MessageAttachments } from "./message-attachments.tsx";
import { MessageContent } from "./message-content.tsx";
import type { MessageMenuItem } from "./message-menu.tsx";
import { MessageOptions } from "./message-options.tsx";
import { MessageSources } from "./message-sources.tsx";
import { QuestionCard } from "./question-card.tsx";
import { VoiceMessage } from "./voice-message.tsx";

export interface MessageEntryProps {
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
	/**
	 * Rows this message can offer in its own menu, or none. The entry asks at open time, so a message
	 * with nothing to do never becomes a tab stop and never opens an empty panel.
	 */
	menuRows?: ((message: CachedMessage) => MessageMenuItem[]) | undefined;
	onMenu?: ((message: CachedMessage, rows: MessageMenuItem[], point: MenuPoint) => void) | undefined;
}

export interface MenuPoint {
	/** Viewport coordinates for a pointer; the entry's own box for the keyboard. */
	x: number;
	y: number;
	/** Where focus goes when the menu closes. */
	from: HTMLElement;
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
	const menu = menuRows && onMenu ? menuRows : undefined;
	const openFrom = (point: MenuPoint) => {
		if (!menu || !onMenu) return;
		const rows = menu(message);
		if (rows.length) onMenu(message, rows, point);
	};
	const menuProps = menu
		? {
				tabIndex: 0,
				"aria-haspopup": "menu" as const,
				onContextMenu: (event: MouseEvent<HTMLElement>) => {
					event.preventDefault();
					openFrom({ x: event.clientX, y: event.clientY, from: event.currentTarget });
				},
				onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
					if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
					event.preventDefault();
					const box = event.currentTarget.getBoundingClientRect();
					openFrom({ x: box.right, y: box.top, from: event.currentTarget });
				},
			}
		: {};
	return (
		<article
			key={message.id}
			data-message-id={message.id}
			data-message-sender={self ? "self" : "other"}
			{...menuProps}
			className={`flex min-w-0 flex-col gap-[var(--spacing-1)] rounded-[var(--radius-control-sm)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] ${self ? "items-end" : "items-start"}`}
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
