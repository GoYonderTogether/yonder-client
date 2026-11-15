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
	const runs: CachedMessage[][] = [];
	for (const message of items) {
		const last = runs.at(-1);
		if (last?.[0]?.senderId === message.senderId) last.push(message);
		else runs.push([message]);
	}
	return runs.map((run) => {
		const first = run[0];
		if (!first) return null;
		const self = first.senderId === person?.id;
		const entries = run.map((message) => <MessageEntry key={message.id} message={message} self={self} {...actions} />);
		const member =
			conversation.members.find((member) => member.memberId === first.senderId) ??
			(self ? person : first.senderId === bot?.id ? bot : undefined);
		const name = member?.displayName || t("chat.unknownSender");
		return (
			<div
				key={first.id}
				data-message-run={first.senderId}
				data-run-sender={self ? "self" : "other"}
				className={`message-run ${self ? "message-run-outgoing" : ""}`}
			>
				<div data-message-sender-avatar className="message-run-avatar">
					<Avatar
						name={name}
						src={member?.avatarUrl}
						color={member?.avatarColor}
						kind={member?.kind ?? first.senderKind}
						size={32}
					/>
				</div>
				<div className="message-run-messages">
					{conversation.kind === "group" ? (
						<div data-message-sender-header>
							<span
								data-message-sender-name
								title={name}
								className="message-run-name text-caption text-[var(--color-text-secondary)]"
							>
								{name}
							</span>
						</div>
					) : null}
					{entries}
				</div>
			</div>
		);
	});
}

function MessageEntry({ message, self, disconnected, onResend, onRetry, retrying }: MessageProps) {
	const { t } = useTranslation();
	return (
		<article
			key={message.id}
			data-message-id={message.id}
			data-message-sender={self ? "self" : "other"}
			className={`flex min-w-0 flex-col gap-[var(--spacing-1)] ${self ? "items-end" : "items-start"}`}
		>
			{message.body || message.streaming ? (
				<div className={`message-bubble ${self ? "message-bubble-outgoing" : "message-bubble-incoming"}`}>
					{message.body ? (
						<MessageContent body={message.body} streaming={message.streaming} />
					) : (
						<span role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t(disconnected ? "chat.reconnectingReply" : "chat.streaming")}
						</span>
					)}
				</div>
			) : null}
			<MessageAttachments attachments={message.attachments} />
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
			return "chat.quotaCodingExhausted";
		case "external_quota_exhausted":
			return "chat.quotaExternalExhausted";
		default:
			return "chat.runFailed";
	}
}
