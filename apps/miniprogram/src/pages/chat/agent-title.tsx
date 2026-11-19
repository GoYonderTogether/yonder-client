import { Text, View } from "@tarojs/components";
import { agentChatStatus } from "@yonder/chat-model";
import type { ConversationMember, Message } from "@yonder/protocol";
import { useEffect, useRef } from "react";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api, client, subscribeEvents, useRealtimeRevision } from "../../lib/runtime";
import { ChatAvatar } from "./avatar";

export function AgentTitle({ bot, messages }: { bot: ConversationMember; messages: readonly Message[] }) {
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
			<Text className="mini-agent-title-line">{bot.displayName}</Text>
			{label ? (
				<Text className="mini-agent-title-line mini-agent-title-status" ariaRole="status">
					{label}
				</Text>
			) : null}
		</View>
	);
}
