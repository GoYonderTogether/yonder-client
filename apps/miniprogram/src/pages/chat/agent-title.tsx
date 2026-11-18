import { Text, View } from "@tarojs/components";
import { agentChatStatus } from "@yonder/chat-model";
import type { ConversationMember, Message } from "@yonder/protocol";
import { t } from "../../lib/i18n";
import { client } from "../../lib/runtime";
import { ChatAvatar } from "./avatar";

export function AgentTitle({ bot, messages }: { bot: ConversationMember; messages: readonly Message[] }) {
	const status = agentChatStatus(messages, bot.memberId);
	const label = status?.activity
		? status.activity
		: status?.kind === "queued"
			? t("排队中…", "Queued…")
			: status?.kind === "working"
				? t("处理中…", "Working…")
				: status?.kind === "replying"
					? t("回复中…", "Replying…")
					: undefined;
	const avatar = bot.avatarUrl?.startsWith("/") ? `${client.baseUrl}${bot.avatarUrl}` : bot.avatarUrl;
	return (
		<View className="mini-agent-title" ariaRole="group" ariaLabel={bot.displayName}>
			<ChatAvatar name={bot.displayName} kind="bot" src={avatar} color={bot.avatarColor} size={48} />
			<Text className="mini-agent-title-line" ariaRole="status">
				{label ?? bot.displayName}
			</Text>
		</View>
	);
}
