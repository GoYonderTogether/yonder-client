import type { Message } from "@yonder/protocol";

export function optionCardState<T extends Message & { pending?: boolean; sendFailed?: boolean }>(
	items: readonly T[],
	personId: string | undefined,
) {
	let openId: string | undefined;
	const replies = new Map<string, T>();
	for (const item of items) {
		if (item.options?.length) openId = item.id;
		else if (personId && item.senderId === personId) {
			if (!item.sendFailed) openId = undefined;
			if (item.clientNonce?.startsWith("option:")) replies.set(item.clientNonce.slice("option:".length), item);
		}
	}
	return { openId, replies };
}

export function optionCardAttachments(message: Message) {
	if (!message.optionImageIds?.length || !message.options?.length)
		return { images: [], attachments: message.attachments };
	const images = message.options.map((_, index) =>
		message.attachments.find((file) => file.kind === "image" && file.id === message.optionImageIds?.[index]),
	);
	return { images, attachments: message.attachments.filter((file) => !images.includes(file)) };
}
