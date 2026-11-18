import { Text, View } from "@tarojs/components";
import { MessageAttachmentsFrame, MessageBubble, MessageRun } from "@yonder/chat-presentation";
import type { ReactNode } from "react";
import { Button, go } from "../../components/ui";
import { t } from "../../lib/i18n";
import { client } from "../../lib/runtime";
import { MessageAttachment } from "./attachment";
import { ChatAvatar } from "./avatar";
import { senderBotId } from "./bot-entry";
import { ChatView } from "./host";
import { MessageBody } from "./markdown";
import { runFailureText, systemText } from "./sentences";
import type { useChat } from "./use-chat";

type ChatMessage = ReturnType<typeof useChat>["messages"][number];
type RunMessage = ChatMessage[];

/** The Bot's avatar in a one-to-one chat opens its page, as its name in the title does. */
function BotAvatarLink({ id, children }: { id: string; children: ReactNode }) {
	return (
		<View
			onClick={() => go(`/pages/bot/index?id=${encodeURIComponent(id)}`)}
			ariaRole="button"
			ariaLabel={t("打开 Bot", "Open bot")}
		>
			{children}
		</View>
	);
}

/**
 * A group-lifecycle line: nobody is speaking, so it is one centred sentence with no avatar, no
 * bubble and no grouping (`systemSentence` makes the words). A `task_notice` keeps its own bubble.
 */
export function SystemLine({ message }: { message: ChatMessage }) {
	const text = message.system ? systemText(message.system) : (message.body ?? "");
	return (
		<View className="mini-chat-system" id={`message-${message.id}`}>
			<Text className="mini-chat-system-text">{text}</Text>
		</View>
	);
}

export function renderRun(
	run: RunMessage,
	chat: ReturnType<typeof useChat>,
	isGroup: boolean,
	followAfterLayout: () => void,
) {
	const first = run[0];
	if (!first) return null;
	// A run of system lines shares no sender; each line stands on its own, centred.
	if (first.type === "system")
		return (
			<>
				{run.map((message) => (
					<SystemLine key={message.id} message={message} />
				))}
			</>
		);
	const self = first.senderId === chat.me?.member.id;
	const sender = chat.conversation?.members.find((member) => member.memberId === first.senderId);
	const name = sender?.displayName || t("成员", "Member");
	const avatarUrl = sender?.avatarUrl;
	const botId = senderBotId(chat.conversation, first.senderId);
	const avatar = (
		<ChatAvatar
			name={name}
			kind={sender?.kind ?? first.senderKind}
			src={avatarUrl ? (avatarUrl.startsWith("/") ? `${client.baseUrl}${avatarUrl}` : avatarUrl) : undefined}
			color={sender?.avatarColor}
		/>
	);
	return (
		<View className="mini-chat-run" key={first.id}>
			<MessageRun
				as={ChatView}
				self={self}
				senderId={first.senderId}
				avatar={botId ? <BotAvatarLink id={botId}>{avatar}</BotAvatarLink> : avatar}
				sender={isGroup ? <View className="message-run-name">{name}</View> : null}
			>
				{run.map((message) => (
					<View
						className={`mini-chat-entry ${self ? "mini-chat-entry-self" : ""}`}
						id={`message-${message.id}`}
						key={message.id}
					>
						{message.body || message.streaming ? (
							<MessageBubble as={ChatView} self={self}>
								{message.body ? (
									<MessageBody body={message.body} streaming={message.streaming} />
								) : (
									<Text className="mini-muted">
										{message.streaming ? t("正在生成…", "Generating…") : t("正在重连…", "Reconnecting…")}
									</Text>
								)}
							</MessageBubble>
						) : null}
						{message.attachments?.length ? (
							<MessageAttachmentsFrame as={ChatView} self={self}>
								{message.attachments.map((file) => (
									<MessageAttachment key={file.id} file={file} onSizeChange={followAfterLayout} />
								))}
							</MessageAttachmentsFrame>
						) : null}
						{message.pending ? <Text className="mini-muted">{t("发送中…", "Sending…")}</Text> : null}
						{message.sendFailed ? (
							<Button secondary onClick={() => void chat.action(message)}>
								{t("发送失败，重试", "Send failed · Retry")}
							</Button>
						) : null}
						{message.run?.status === "failed" ? (
							<View className="mini-chat-run-error">
								<Text className="mini-error">{runFailureText(message.run.failureReason)}</Text>
								<Button secondary onClick={() => void chat.action(message)}>
									{t("重试", "Retry")}
								</Button>
							</View>
						) : null}
					</View>
				))}
			</MessageRun>
		</View>
	);
}
