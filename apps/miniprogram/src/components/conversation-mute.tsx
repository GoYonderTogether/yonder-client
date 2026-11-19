import { Switch, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { api, subscribeEvents } from "../lib/runtime";
import { State } from "./ui";
import { useResource } from "./use-resource";

export function ConversationMute({ conversationId }: { conversationId: string }) {
	const { data, error, loading, reload } = useResource(async () => {
		const result = await api.conversations();
		return result.items.find((item) => item.id === conversationId && !item.closedReason);
	});
	const [pending, setPending] = useState<boolean | null>(null);
	const [failure, setFailure] = useState("");
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "conversation.state_changed" && event.conversationId === conversationId) void reload();
			}),
		[conversationId, reload],
	);
	if (!data) return error ? <State error={error} retry={() => void reload()} /> : null;
	const label = t("消息免打扰", "Mute notifications");
	async function save(muted: boolean) {
		setPending(muted);
		setFailure("");
		try {
			await api.setConversationMuted(conversationId, muted);
			await reload();
		} catch {
			setFailure(t("无法更改免打扰设置，请重试。", "Could not change notifications. Try again."));
		} finally {
			setPending(null);
		}
	}
	return (
		<View className="mini-card">
			<View className="mini-row">
				<Text className="mini-row-main">{label}</Text>
				<Switch
					ariaLabel={label}
					checked={pending ?? data.muted ?? false}
					disabled={loading || pending !== null}
					onChange={(event) => void save(event.detail.value)}
				/>
			</View>
			{failure || error ? <Text className="mini-error">{failure || error}</Text> : null}
		</View>
	);
}
