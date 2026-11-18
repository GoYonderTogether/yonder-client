import { Text, View } from "@tarojs/components";
import { useRouter } from "@tarojs/taro";
import type { MemberProfileResponse } from "@yonder/protocol";
import { useState } from "react";
import { ConversationMute } from "../../components/conversation-mute";
import { action, Button, go, Page, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api, client } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";
import { cardAction, loadCard } from "./model";
import { botChatStarter } from "./start-chat";

/**
 * The one primary action. `open_chat` without a conversation id means the chat does not exist yet;
 * the same idempotent contact call makes it (and is a no-op for someone already a contact).
 */
function CardButton({ profile }: { profile: MemberProfileResponse }) {
	const [busy, setBusy] = useState(false);
	const chat = cardAction(profile);
	const startBotChat = botChatStarter();
	const openChat = (id: string) => go(`/pages/chat/index?id=${encodeURIComponent(id)}`);
	if (chat.kind === "open_chat" && chat.conversationId) {
		const id = chat.conversationId;
		return <Button onClick={() => openChat(id)}>{t("发消息", "Message")}</Button>;
	}
	if (chat.kind === "open_chat" || chat.kind === "add_contact")
		return (
			<Button
				loading={busy}
				disabled={!profile.memberId}
				onClick={() =>
					void action(async () => {
						setBusy(true);
						try {
							openChat((await api.addContact(profile.memberId ?? "")).conversation.id);
						} finally {
							setBusy(false);
						}
					})
				}
			>
				{chat.kind === "add_contact" ? t("加为联系人", "Add as contact") : t("发消息", "Message")}
			</Button>
		);
	if (chat.kind === "start_chat" && startBotChat) {
		const start = startBotChat;
		return <Button onClick={() => start(profile.card)}>{t("开始聊天", "Start chatting")}</Button>;
	}
	return null;
}

function MatterButton({ profile }: { profile: MemberProfileResponse }) {
	const [busy, setBusy] = useState(false);
	const bot = profile.bots?.find((item) => item.reception);
	if (!bot || profile.card.kind !== "person" || profile.relation === "self") return null;
	return (
		<Button
			loading={busy}
			onClick={() =>
				void action(async () => {
					setBusy(true);
					try {
						const { conversation } = await api.startVisit({ handle: bot.handle });
						go(`/pages/chat/index?id=${encodeURIComponent(conversation.id)}`);
					} finally {
						setBusy(false);
					}
				})
			}
		>
			{t("有事找 TA", "Talk to their Bot")}
		</Button>
	);
}

export default function Member() {
	const { handle: encodedHandle = "", conversationId } = useRouter().params;
	const handle = decodeURIComponent(encodedHandle);
	const { data, loading, error, reload } = useResource(() => loadCard(() => api.memberProfile(handle)));
	const card = data && "profile" in data ? data.profile.card : undefined;
	const avatar = card?.avatarUrl;
	const owner = card?.owner;
	return (
		<Page title={t("名片", "Card")}>
			<State loading={loading} />
			{error ? <State error={error} retry={() => void reload()} /> : null}
			{data && "notFound" in data ? (
				<View className="mini-card">
					<State empty={t("没有找到这个用户", "That member was not found")} />
				</View>
			) : null}
			{data && "profile" in data && card ? (
				<View className="mini-card">
					<View className="mini-row">
						<ChatAvatar
							name={card.displayName}
							kind={card.kind}
							src={avatar ? (avatar.startsWith("/") ? `${client.baseUrl}${avatar}` : avatar) : undefined}
							color={card.avatarColor}
							size={56}
						/>
						<View className="mini-row-main">
							<Text className="mini-subtitle">{card.displayName}</Text>
							<Text className="mini-muted">{`@${card.handle}`}</Text>
						</View>
					</View>
					{card.bio ? <Text className="mini-pre">{card.bio}</Text> : null}
					{owner ? (
						<View
							className="mini-row"
							onClick={() => go(`/pages/member/index?handle=${encodeURIComponent(owner.handle)}`)}
						>
							<View className="mini-row-main">
								<Text className="mini-muted">{t(`${owner.displayName} 的 Bot`, `${owner.displayName}'s bot`)}</Text>
							</View>
							<Text className="mini-muted">›</Text>
						</View>
					) : null}
					<CardButton profile={data.profile} />
					<MatterButton profile={data.profile} />
				</View>
			) : null}
			{card && conversationId ? <ConversationMute conversationId={conversationId} /> : null}
		</Page>
	);
}
