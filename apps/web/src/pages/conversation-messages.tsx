import { groupMessages } from "@yonder/chat-model";
import { MessageBubble, MessageRun } from "@yonder/chat-presentation";
import { systemEventText } from "@yonder/feature-members";
import type { Conversation, Member } from "@yonder/protocol";
import { Avatar, Button } from "@yonder/ui-components";
import type { CachedMessage } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { MessageAttachments } from "./message-attachments.tsx";
import { MessageContent } from "./message-content.tsx";

interface MessageProps {
	message: CachedMessage;
	self: boolean;
	disconnected: boolean;
	onResend: (message: CachedMessage) => void;
	onRetry: (userMessageId: string) => void;
	retrying: boolean;
	onOpenMeeting?: (id: string) => void;
}

/** A system event stands alone; consecutive messages by one sender stay one run, as before. */
type Block = { system: CachedMessage } | { run: CachedMessage[] };

function blocksOf(items: readonly CachedMessage[]): Block[] {
	const out: Block[] = [];
	let current: CachedMessage[] = [];
	const flush = () => {
		for (const run of groupMessages(current)) out.push({ run });
		current = [];
	};
	for (const item of items) {
		if (item.type === "system") {
			flush();
			out.push({ system: item });
		} else current.push(item);
	}
	flush();
	return out;
}

/** Sender identity belongs to a consecutive run, shared by text and attachment messages. */
export function ConversationMessages({
	items,
	conversation,
	person,
	bot,
	...actions
}: Omit<MessageProps, "message" | "self"> & {
	items: CachedMessage[];
	conversation: Conversation;
	person?: Member | undefined;
	bot?: Member | undefined;
}) {
	const { t } = useTranslation();
	return blocksOf(items).map((block) => {
		// A group lifecycle message has no sender speaking: one muted centred line, no avatar (19 3.3).
		if ("system" in block) return <SystemLine key={block.system.id} message={block.system} />;
		const run = block.run;
		const first = run[0];
		if (!first) return null;
		const self = first.senderId === person?.id;
		const entries = run.map((message) => <MessageEntry key={message.id} message={message} self={self} {...actions} />);
		const member =
			conversation.members.find((member) => member.memberId === first.senderId) ??
			(self ? person : first.senderId === bot?.id ? bot : undefined);
		const name = member?.displayName || t("chat.unknownSender");
		return (
			<MessageRun
				as="div"
				key={first.id}
				self={self}
				senderId={first.senderId}
				avatar={
					<Avatar
						name={name}
						src={member?.avatarUrl}
						color={member?.avatarColor}
						kind={member?.kind ?? first.senderKind}
						size={32}
					/>
				}
				sender={
					conversation.kind === "group" ? (
						<div data-message-sender-header>
							<span
								data-message-sender-name
								title={name}
								className="message-run-name text-caption text-[var(--color-text-secondary)]"
							>
								{name}
							</span>
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
	const text = message.system ? systemEventText(message.system, t) : "";
	if (!text) return null;
	return (
		<p
			key={message.id}
			data-message-id={message.id}
			data-message-system
			role="note"
			className="mx-auto max-w-full px-[var(--spacing-4)] text-center text-caption text-[var(--color-text-tertiary)]"
		>
			{text}
		</p>
	);
}

function MessageEntry({ message, self, disconnected, onResend, onRetry, retrying, onOpenMeeting }: MessageProps) {
	const { t } = useTranslation();
	return (
		<article
			key={message.id}
			data-message-id={message.id}
			data-message-sender={self ? "self" : "other"}
			className={`flex min-w-0 flex-col gap-[var(--spacing-1)] ${self ? "items-end" : "items-start"}`}
		>
			{message.body || message.streaming ? (
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
			<MessageAttachments attachments={message.attachments} self={self} />
			{message.meeting && onOpenMeeting ? (
				<Button
					size="sm"
					onClick={() => {
						if (message.meeting) onOpenMeeting(message.meeting.id);
					}}
				>
					{t("meetingRecorder.openResult", { title: message.meeting.title })}
				</Button>
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
					<Button variant="link" size="sm" onClick={() => onRetry(message.run?.userMessageId ?? "")} loading={retrying}>
						{t("app.retry")}
					</Button>
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
		case "idle_timeout":
			return "chat.idleTimeout";
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
		case "subtask_burst":
			return "chat.subtaskBurst";
		default:
			return "chat.scheduleFailed";
	}
}
