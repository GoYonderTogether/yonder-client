import { useDidHide, useDidShow } from "@tarojs/taro";
import { newestReadableMessage } from "@yonder/chat-model";
import type { Message } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/runtime";

export function useVisibleRead(
	conversationId: string,
	personId: string | undefined,
	items: readonly Message[],
	readingLatest: boolean,
) {
	const [visible, setVisible] = useState(false);
	const ack = useRef<string>();
	useDidShow(() => setVisible(true));
	useDidHide(() => setVisible(false));
	const messageId = visible && readingLatest && personId ? newestReadableMessage(items, personId) : undefined;
	useEffect(() => {
		if (!conversationId || !personId || !messageId) return;
		const scope = `${personId}:${conversationId}:${messageId}`;
		if (scope === ack.current) return;
		let active = true;
		void api
			.markConversationRead(conversationId, messageId)
			.then(() => {
				if (active) ack.current = scope;
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [conversationId, personId, messageId]);
}
