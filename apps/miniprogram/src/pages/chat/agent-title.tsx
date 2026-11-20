import { Text, View } from "@tarojs/components";
import { agentChatStatus, ownedBotFor } from "@yonder/chat-model";
import type { ConversationMember, Message } from "@yonder/protocol";
import { useEffect, useRef } from "react";
import { MiniBotName } from "../../components/bot-name";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api, client, subscribeEvents, useCachedBots, useRealtimeRevision, useSession } from "../../lib/runtime";
import { ChatAvatar } from "./avatar";

export function AgentTitle({
	bot,
	messages,
	owner,
}: {
	bot: ConversationMember;
	messages: readonly Message[];
	owner?: ConversationMember["botOwner"];
}) {
	const { me } = useSession();
	const owned = ownedBotFor(bot.memberId, me?.member.id, me?.bot, useCachedBots());
	const { data, reload } = useResource(() => api.activeBotSubtasks(bot.memberId));
	const revision = useRealtimeRevision();
	const lastRevision = useRef(revision);
	useEffect(() => {
		if (revision === lastRevision.current) return;
		lastRevision.current = revision;
		void reload();
	}, [reload, revision]);
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "subtask.updated") void reload();
			}),
		[reload],
	);
	const status = agentChatStatus(messages, bot.memberId, data);
	const label =
		status?.kind === "processing"
			? t(`正在处理：${status.titles.join("、")}`, `Working on: ${status.titles.join(", ")}`)
			: status?.kind === "typing"
				? t("正在输入", "Typing")
				: undefined;
	const avatar = bot.avatarUrl?.startsWith("/") ? `${client.baseUrl}${bot.avatarUrl}` : bot.avatarUrl;
	return (
		<View className="mini-agent-title" ariaRole="group" ariaLabel={bot.displayName}>
			<ChatAvatar name={bot.displayName} kind="bot" src={avatar} color={bot.avatarColor} size={48} />
			<MiniBotName name={bot.displayName} ownedBot={owned} owner={owner} compact="header" />
			{label ? (
				<Text className="mini-agent-title-line mini-agent-title-status" ariaRole="status">
					{label}
				</Text>
			) : null}
		</View>
	);
}
