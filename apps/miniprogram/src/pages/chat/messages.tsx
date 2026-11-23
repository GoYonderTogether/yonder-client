import { Text, View } from "@tarojs/components";
import {
	attachmentsOutsideQuestionCard,
	type MessageBlock,
	optionCardAttachments,
	type optionCardState,
	ownedBotFor,
} from "@yonder/chat-model";
import { MessageAttachmentsFrame, MessageBubble, MessageRun, MessageTime } from "@yonder/chat-presentation";
import type { Member } from "@yonder/protocol";
import type { ReactNode } from "react";
import { MiniBotName } from "../../components/bot-name";
import { FriendRequestCard } from "../../components/friend-request-card";
import { Button, go } from "../../components/ui";
import { type Locale, t } from "../../lib/i18n";
import { client } from "../../lib/runtime";
import { MessageAttachment } from "./attachment";
import { ChatAvatar } from "./avatar";
import { senderBotId } from "./bot-entry";
import { ConnectorRequestCard } from "./connector-request-card";
import { ChatView } from "./host";
import { MessageBody } from "./markdown";
import { MessageSources } from "./message-sources";
import { MessageOptions } from "./option-card";
import { QuestionMessageCard } from "./question-card";
import { runFailureText, systemText } from "./sentences";
import type { useChat } from "./use-chat";
import { VoiceMessage } from "./voice-message";

type ChatMessage = ReturnType<typeof useChat>["messages"][number];

/** A Bot with its own page can be opened from its avatar when messages show avatars. */
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

export function renderMessageBlock(
	block: MessageBlock<ChatMessage>,
	chat: ReturnType<typeof useChat>,
	{
		showMessageAvatars,
		showSenderNames,
		locale,
		contacts,
	}: { showMessageAvatars: boolean; showSenderNames: boolean; locale: Locale; contacts: readonly Member[] },
	followAfterLayout: () => void,
	optionCards: ReturnType<typeof optionCardState<ChatMessage>>,
) {
	if ("time" in block)
		return (
			<MessageTime
				key={`time-${block.messageId}`}
				at={block.time}
				locale={locale}
				atStart={block.atStart}
				render={(text) => (
					<View className="mini-chat-system">
						<Text className="mini-chat-system-text">{text}</Text>
					</View>
				)}
			/>
		);
	const run = block.run;
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
	if (chat.conversation?.kind === "system")
		return (
			<>
				{run.map((message) => (
					<View key={message.id} id={`message-${message.id}`}>
						{message.friendRequestId ? (
							<FriendRequestCard id={message.friendRequestId} />
						) : (
							<SystemLine message={message} />
						)}
					</View>
				))}
			</>
		);
	const self = first.senderId === chat.memberId;
	const sender = chat.conversation?.members.find((member) => member.memberId === first.senderId);
	const name = sender?.displayName || t("成员", "Member");
	const avatarUrl = sender?.avatarUrl;
	const botId = senderBotId(chat.conversation, first.senderId);
	const avatar = showMessageAvatars ? (
		<ChatAvatar
			name={name}
			kind={sender?.kind ?? first.senderKind}
			src={avatarUrl ? (avatarUrl.startsWith("/") ? `${client.baseUrl}${avatarUrl}` : avatarUrl) : undefined}
			color={sender?.avatarColor}
		/>
	) : null;
	return (
		<View className="mini-chat-run" key={first.id}>
			<MessageRun
				as={ChatView}
				self={self}
				senderId={first.senderId}
				avatar={botId && avatar ? <BotAvatarLink id={botId}>{avatar}</BotAvatarLink> : avatar}
				sender={
					showSenderNames ? (
						first.senderKind === "bot" ? (
							<MiniBotName
								name={name}
								ownedBot={ownedBotFor(first.senderId, chat.me?.member.id, chat.me?.bot, contacts)}
								owner={sender?.botOwner}
							/>
						) : (
							<View className="message-run-name">{name}</View>
						)
					) : null
				}
			>
				{run.map((message) => {
					const { attachments: legacyAttachments, images } = optionCardAttachments(message);
					const attachments = message.questionCard ? attachmentsOutsideQuestionCard(message) : legacyAttachments;
					const file = attachments[0];
					const voice = file && attachments.every(({ kind }) => kind === "audio") ? message.voice : undefined;
					const reply = optionCards.replies.get(message.id);
					const canChoose = message.id === optionCards.openId && !chat.sending && !reply;
					return (
						<View
							className={`mini-chat-entry ${self ? "mini-chat-entry-self" : ""}`}
							id={`message-${message.id}`}
							key={message.id}
						>
							{message.connectorRequestId ? (
								<ConnectorRequestCard key={message.connectorRequestId} id={message.connectorRequestId} />
							) : message.questionCard && chat.me ? (
								<QuestionMessageCard
									key={`${chat.me.member.id}:${message.id}`}
									message={message}
									card={message.questionCard}
									ownerId={chat.me.member.id}
									onMessages={chat.applyQuestionMessages}
								/>
							) : message.options?.length ? (
								<MessageOptions
									question={message.body}
									options={message.options}
									images={images}
									selected={reply && !reply.pending && !reply.sendFailed ? reply.body : null}
									onChoose={
										canChoose
											? (option) => {
													followAfterLayout();
													void chat.send(option, [], [], `option:${message.id}`);
												}
											: undefined
									}
								/>
							) : voice && file ? (
								<VoiceMessage
									key={file.id}
									fileIds={attachments.map(({ id }) => id)}
									durationMs={voice.durationMs}
									self={self}
								/>
							) : message.body?.trim() || (message.streaming && message.senderKind !== "bot") ? (
								<MessageBubble as={ChatView} self={self}>
									{message.questionReply?.question ? (
										<Text className="mini-question-quote">{message.questionReply.question.replace(/\n/g, " · ")}</Text>
									) : null}
									{message.body ? (
										<MessageBody body={message.body} streaming={message.streaming} />
									) : (
										<Text className="mini-muted">
											{message.streaming ? t("正在生成…", "Generating…") : t("正在重连…", "Reconnecting…")}
										</Text>
									)}
								</MessageBubble>
							) : null}
							{message.reaction ? <Text>{message.reaction}</Text> : null}
							{message.outwardRequest && !message.body?.trim() ? (
								<Text className="mini-muted">{outwardStatus(message.outwardRequest.state)}</Text>
							) : null}
							<MessageSources run={message.run} />
							{!voice && attachments.length ? (
								<MessageAttachmentsFrame as={ChatView} self={self}>
									{attachments.map((file) => (
										<MessageAttachment key={file.id} file={file} onSizeChange={followAfterLayout} />
									))}
								</MessageAttachmentsFrame>
							) : null}
							{voice?.transcription === "pending" ? (
								<Text className="mini-muted">{t("正在转录…", "Transcribing…")}</Text>
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
									{message.run.canRetry !== false ? (
										<Button secondary onClick={() => void chat.action(message)}>
											{t("重试", "Retry")}
										</Button>
									) : null}
								</View>
							) : null}
						</View>
					);
				})}
			</MessageRun>
		</View>
	);
}

function outwardStatus(state: NonNullable<ChatMessage["outwardRequest"]>["state"]) {
	switch (state) {
		case "open":
			return t("等待主人答复", "Waiting for the owner’s reply");
		case "answered":
			return t("主人已处理请求", "The owner responded");
		case "declined":
			return t("主人已拒绝请求", "The owner declined the request");
		case "cancelled":
			return t("请求已取消", "Request cancelled");
		case "expired":
			return t("请求已过期", "Request expired");
	}
}
