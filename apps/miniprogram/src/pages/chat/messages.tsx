import { Text, View } from "@tarojs/components";
import { MessageAttachmentsFrame, MessageBubble, MessageRun } from "@yonder/chat-presentation";
import { Button } from "../../components/ui";
import { t } from "../../lib/i18n";
import { client } from "../../lib/runtime";
import { MessageAttachment } from "./attachment";
import { ChatAvatar } from "./avatar";
import { ChatView } from "./host";
import { MessageBody } from "./markdown";
import type { useChat } from "./use-chat";

type ChatMessage = ReturnType<typeof useChat>["messages"][number];
type RunMessage = ChatMessage[];

export function renderRun(
	run: RunMessage,
	chat: ReturnType<typeof useChat>,
	isGroup: boolean,
	followAfterLayout: () => void,
) {
	const first = run[0];
	if (!first) return null;
	const self = first.senderId === chat.me?.member.id;
	const sender = chat.conversation?.members.find((member) => member.memberId === first.senderId);
	const name = sender?.displayName || t("成员", "Member");
	const avatarUrl = sender?.avatarUrl;
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
				avatar={avatar}
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
								<Text className="mini-error">{message.run.failureReason || t("生成失败", "Generation failed")}</Text>
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
