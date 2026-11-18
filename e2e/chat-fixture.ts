import type { Page, WebSocketRoute } from "@playwright/test";
import type { Conversation, Member, Message } from "@yonder/protocol";
import { quota } from "./fixtures/quota.ts";

// Only the automated browser uses these isolated API records. The product route is unmodified.
export const person: Member = {
	id: "chat-person",
	kind: "person",
	handle: "chatcheck",
	displayName: "界面验收用户",
	avatarUrl: null,
	bio: null,
	createdAt: "2026-11-15T00:00:00Z",
	version: 1,
};
export const bot: Member = { ...person, id: "chat-bot", kind: "bot", handle: "chatbot", displayName: "界面验收 BOT" };
export const conversation: Conversation = {
	id: "chat-route-check",
	kind: "direct",
	isPrimary: true,
	title: null,
	members: [person, bot].map(({ id, kind, handle, displayName, avatarUrl }) => ({
		memberId: id,
		kind,
		handle,
		displayName,
		avatarUrl,
	})),
	lastMessageAt: null,
	unreadCount: 0,
	pinned: true,
	version: 1,
};
export function message(id: string, body: string | null, self = false, streaming = false): Message {
	return {
		id,
		body,
		conversationId: conversation.id,
		senderId: self ? person.id : bot.id,
		senderKind: self ? "person" : "bot",
		type: "text",
		streaming,
		attachments: [],
		replyToId: null,
		createdAt: `2026-11-15T00:00:${id.slice(-2)}Z`,
		editedAt: null,
		version: 1,
	};
}
export const bodies = {
	question: "请检查双方消息的气泡、中文换行与代码显示。",
	answer: "收到。用户消息在右侧，BOT 回复在左侧，双方都保留独立气泡。\n\n**接下来**确认手机输入区与顶部面板。",
	long: `长链接与长代码应留在气泡内：\n\nhttps://example.org/${"very-long-path-".repeat(20)}\n\n\`\`\`ts\nconst filename = "${"long-value-".repeat(30)}";\n\`\`\`\n\n[这是一份很长很长很长很长的产品设计需求说明.pdf](/files/spec.pdf)`,
};
export async function isolateChat(
	page: Page,
	options: { dark?: boolean; group?: boolean; items?: Message[]; members?: Conversation["members"] } = {},
) {
	const items = options.items ?? [message("message-01", bodies.question, true), message("message-02", bodies.answer)];
	const current = {
		...conversation,
		members: options.members ?? conversation.members,
		...(options.group ? { kind: "group" as const, title: "界面验收群聊" } : {}),
	};
	const sent: { body: string; type: string; clientNonce: string }[] = [];
	const sockets: WebSocketRoute[] = [];
	await page.addInitScript(
		({ dark }) => {
			localStorage.setItem("yonder.locale", "zh-CN");
			localStorage.setItem("yonder.theme", dark ? "dark" : "light");
		},
		{ dark: options.dark },
	);
	await page.route("**/v1/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/messages") && route.request().method() === "POST") {
			const payload = route.request().postDataJSON();
			sent.push(payload);
			const saved = { ...message(`sent-${sent.length + 10}`, payload.body, true), clientNonce: payload.clientNonce };
			items.push(saved);
			await route.fulfill({ json: { message: saved, clientNonce: payload.clientNonce } });
			return;
		}
		const json =
			path === "/v1/auth/refresh"
				? { accessToken: "isolated-chat-ui", expiresIn: 3600 }
				: path === "/v1/me"
					? {
							member: person,
							bot,
							hasPassword: true,
							signInMethods: [],
							settings: { locale: "zh-CN", theme: options.dark ? "dark" : "light" },
						}
					: path === "/v1/conversations"
						? { items: [current] }
						: path.endsWith("/messages")
							? { items, nextCursor: null, hasMore: false }
							: path === "/v1/health"
								? { ok: true, version: "isolated-chat-ui" }
								: path === "/v1/quota"
									? quota
									: path === "/v1/me/social"
										? { approved: "", drafts: [] }
										: { items: [] };
		await route.fulfill({ json });
	});
	await page.routeWebSocket("**/v1/realtime*", (socket) => {
		sockets.push(socket);
		socket.onMessage(() => undefined);
	});
	return {
		sent,
		update(value: Message) {
			for (const socket of sockets)
				socket.send(
					JSON.stringify({
						type: "message.updated",
						eventId: crypto.randomUUID(),
						at: new Date().toISOString(),
						message: value,
					}),
				);
		},
	};
}
