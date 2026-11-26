import { Button, Text, View } from "@tarojs/components";
import { ApiError } from "@yonder/api-client";
import { visitRelayTarget } from "@yonder/chat-model";
import { useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { api } from "../../lib/runtime";
import type { useChat } from "./use-chat";

export function VisitRelay({ chat }: { chat: ReturnType<typeof useChat> }) {
	const { messageId, pending } = visitRelayTarget(chat.messages, chat.memberId ?? undefined);
	const lock = useRef(false);
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState<string>();
	const [error, setError] = useState("");
	const ask = async () => {
		if (!messageId || lock.current || sent === messageId) return;
		lock.current = true;
		setSending(true);
		setError("");
		try {
			const result = await api.askOwner(messageId);
			if (result.state === "open") setSent(messageId);
			void chat.load();
		} catch (failure) {
			setError(
				failure instanceof ApiError && failure.status === 429
					? t("每 24 小时可以请主 Bot 转达一次。", "You can ask the main Bot once every 24 hours.")
					: failure instanceof ApiError && failure.code === "conflict_version"
						? t("已有一个请求交给了主 Bot。", "There’s already a request with the main Bot.")
						: t("转达请求未发出。", "Could not send the request."),
			);
		} finally {
			lock.current = false;
			setSending(false);
		}
	};
	return (
		<View className="mini-visit-relay">
			<Button
				className="mini-visit-relay-button"
				disabled={sending || !messageId || sent === messageId}
				loading={sending}
				onClick={() => void ask()}
			>
				{t("请 Bot 转达", "Ask Bot to pass it on")}
			</Button>
			{pending || (sent && sent === messageId) ? (
				<Text ariaRole="status">{t("已交给主 Bot", "Passed to the main Bot")}</Text>
			) : null}
			{error ? <Text ariaRole="alert">{error}</Text> : null}
		</View>
	);
}
