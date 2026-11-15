import Taro, { useDidShow } from "@tarojs/taro";
import type { Attachment, Conversation, SendMessageRequest } from "@yonder/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, newNonce, subscribeEvents, useRealtimeRevision, useSession } from "../../lib/runtime";
import { type ChatMessage, mergeMessages, updateRun } from "./model";

export function useChat(id: string) {
	const { me, status } = useSession();
	const revision = useRealtimeRevision();
	const outboxKey = `yonder.mini.outbox.${me?.member.id ?? ""}.${id}`;
	const [messages, setMessages] = useState<ChatMessage[]>(() => {
		try {
			const stored = Taro.getStorageSync(outboxKey);
			return Array.isArray(stored)
				? stored.map((message: ChatMessage) => ({ ...message, pending: false, sendFailed: true }))
				: [];
		} catch {
			return [];
		}
	});
	const [conversation, setConversation] = useState<Conversation>();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [cursor, setCursor] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const cursorRef = useRef<string | null>(null);
	useEffect(() => {
		if (status !== "signed-in" || !me) return;
		Taro.setStorageSync(
			outboxKey,
			messages.filter((message) => message.pending || message.sendFailed),
		);
	}, [messages, outboxKey, status, me]);
	const active = useRef(true);
	const epoch = useRef(0);
	const requests = useRef(new Map<string, SendMessageRequest>());
	useEffect(() => {
		active.current = Boolean(id && me?.member.id);
		return () => {
			active.current = false;
			epoch.current++;
		};
	}, [id, me?.member.id]);
	const load = useCallback(
		async (older = false) => {
			if (!id || status !== "signed-in") return;
			const ticket = epoch.current;
			setError("");
			try {
				const page = await api.messages(id, older ? (cursorRef.current ?? undefined) : undefined);
				if (!active.current || ticket !== epoch.current) return;
				setMessages((current) => mergeMessages(current, page.items));
				if (older || cursorRef.current === null) {
					cursorRef.current = page.nextCursor;
					setCursor(page.nextCursor);
				}
			} catch (e) {
				if (active.current) setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (active.current) setLoading(false);
			}
		},
		[id, status],
	);
	useEffect(() => {
		void revision;
		void load();
	}, [revision, load]);
	useDidShow(() => {
		if (status === "signed-out") void Taro.reLaunch({ url: "/pages/sign-in/index" });
		else void load();
	});
	useEffect(() => {
		if (status !== "signed-in") return;
		void load();
		void api
			.conversations()
			.then((result) => {
				if (active.current) setConversation(result.items.find((item) => item.id === id));
			})
			.catch(() => {});
		return subscribeEvents((event) => {
			if ((event.type === "message.created" || event.type === "message.updated") && event.message.conversationId === id)
				setMessages((current) => mergeMessages(current, [event.message]));
			if (event.type === "run.updated" && event.run.conversationId === id)
				setMessages((current) => updateRun(current, event.run));
			if (event.type === "conversation.updated" && event.conversation.id === id) setConversation(event.conversation);
		});
	}, [id, status, load]);
	const send = async (body: string, attachments: Attachment[], skillIds: string[], retryNonce?: string) => {
		if (sending || !id) return;
		const ticket = epoch.current;
		const nonce = retryNonce ?? newNonce();
		const request = requests.current.get(nonce) ?? {
			type: "text" as const,
			body,
			attachmentIds: attachments.map((file) => file.id),
			clientNonce: nonce,
			...(skillIds.length ? { skillIds } : {}),
		};
		requests.current.set(nonce, request);
		setSending(true);
		setError("");
		const pending: ChatMessage = {
			id: `temp_${nonce}`,
			conversationId: id,
			senderId: me?.member.id ?? "",
			senderKind: "person",
			type: "text",
			body: request.body,
			attachments,
			replyToId: null,
			createdAt: new Date().toISOString(),
			editedAt: null,
			streaming: false,
			version: 0,
			clientNonce: nonce,
			pending: true,
			skillIds: request.skillIds,
		};
		setMessages((current) => mergeMessages(current, [pending]));
		try {
			const result = await api.sendMessage(id, request);
			if (active.current && ticket === epoch.current)
				setMessages((current) => mergeMessages(current, [{ ...result.message, clientNonce: result.clientNonce }]));
			requests.current.delete(nonce);
			return true;
		} catch (e) {
			if (active.current && ticket === epoch.current) {
				setError(e instanceof Error ? e.message : String(e));
				setMessages((current) =>
					current.map((message) =>
						message.clientNonce === nonce && message.id.startsWith("temp_")
							? { ...message, pending: false, sendFailed: true }
							: message,
					),
				);
			}
			return false;
		} finally {
			if (active.current) setSending(false);
		}
	};
	const action = async (message: ChatMessage) => {
		setError("");
		try {
			if (message.sendFailed) {
				await send(message.body ?? "", message.attachments, message.skillIds ?? [], message.clientNonce ?? undefined);
				return;
			}
			if (message.streaming || message.run?.status === "running" || message.run?.status === "queued")
				await api.stopMessage(message.id);
			else {
				const result = await api.retryMessage(message.id, newNonce());
				setMessages((current) => mergeMessages(current, [result.message]));
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	return {
		me,
		messages: status === "signed-in" ? messages : [],
		conversation,
		loading,
		error,
		cursor,
		sending,
		load,
		send,
		action,
	};
}
