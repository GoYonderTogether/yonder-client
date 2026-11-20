import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
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
	const showing = useRef(false);
	const [scrollRevision, setScrollRevision] = useState(0);
	const ack = useRef<string>();
	useDidShow(() => {
		showing.current = true;
		setVisible(true);
	});
	useDidHide(() => {
		showing.current = false;
		setVisible(false);
	});
	const messageId = visible && readingLatest && personId ? newestReadableMessage(items, personId) : undefined;
	useEffect(() => {
		void scrollRevision;
		if (!conversationId || !personId || !messageId) return;
		const scope = `${personId}:${conversationId}:${messageId}`;
		if (scope === ack.current) return;
		let active = true;
		Taro.nextTick(() => {
			const query = Taro.createSelectorQuery();
			query.select(".mini-message-list").boundingClientRect();
			query.select("#message-end").boundingClientRect();
			query.exec(([viewport, end]) => {
				if (
					!active ||
					!showing.current ||
					!viewport?.height ||
					!end ||
					end.top < viewport.top ||
					end.bottom > viewport.bottom + 2
				)
					return;
				void api
					.markConversationRead(conversationId, messageId)
					.then(() => {
						if (active) ack.current = scope;
					})
					.catch(() => {});
			});
		});
		return () => {
			active = false;
		};
	}, [conversationId, personId, messageId, scrollRevision]);
	return () => setScrollRevision((revision) => revision + 1);
}
