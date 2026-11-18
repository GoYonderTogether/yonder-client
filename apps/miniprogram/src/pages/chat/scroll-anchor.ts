import Taro from "@tarojs/taro";

export type ScrollAnchorMetrics = { relativeY: number; scrollTop: number };

export function measureScrollAnchor(messageId: string): Promise<ScrollAnchorMetrics | null> {
	return new Promise((resolve) => {
		const query = Taro.createSelectorQuery();
		query.select(".mini-message-list").boundingClientRect();
		query.select(".mini-message-list").scrollOffset();
		query.select(`#message-${messageId}`).boundingClientRect();
		query.exec((result) => {
			const viewport = result[0];
			const offset = result[1];
			const message = result[2];
			if (!viewport || !offset || !message) {
				resolve(null);
				return;
			}
			resolve({ relativeY: message.top - viewport.top, scrollTop: offset.scrollTop });
		});
	});
}
