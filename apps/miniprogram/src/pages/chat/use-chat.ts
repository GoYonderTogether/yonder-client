import Taro, { useDidShow } from "@tarojs/taro";
import { ApiError } from "@yonder/api-client";
import { chatHistoryTimeOffset, isNewChatHistoryCutoff } from "@yonder/chat-model";
import type { Attachment, ChatHistoryCutoff, Conversation, Message, SendMessageRequest } from "@yonder/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { patchConversation } from "../../lib/member-cache";
import { api, newNonce, subscribeEvents, useRealtimeRevision, useSession } from "../../lib/runtime";
import { type ChatMessage, mergeMessages, updateRun } from "./model";
import { closureText } from "./sentences";
import { isVisitErrorCode, visitErrorSentence } from "./visits";

export function useChat(id: string) {
	const { me, status } = useSession();
	const revision = useRealtimeRevision();
	const outboxKey = `yonder.mini.outbox.${me?.member.id ?? ""}.${id}`;
	const messagesOwner = useRef(outboxKey);
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
	/** A send refused because the group is closed; a real error, never a Bot line. */
	const [closedError, setClosedError] = useState("");
	/** A send the visit ladder refused (`visit_limit`, `visit_denied`, `visit_cap`): the server's reason. */
	const [visitError, setVisitError] = useState("");
	const [cursor, setCursor] = useState<string | null>(null);
	// A latest-page refresh retains the oldest message already loaded for this chat.
	const [hasFullHistory, setHasFullHistory] = useState(false);
	const [sending, setSending] = useState(false);
	const [olderLoading, setOlderLoading] = useState(false);
	const sendLock = useRef(false);
	const actionLock = useRef(false);
	const cursorRef = useRef<string | null>(null);
	useEffect(() => {
		if (status !== "signed-in" || !me || messagesOwner.current !== outboxKey) return;
		try {
			Taro.setStorageSync(
				outboxKey,
				messages.filter((message) => message.pending || message.sendFailed),
			);
		} catch {
			setError(t("无法保存待发送消息，请重试", "Could not save the pending message. Try again."));
		}
	}, [messages, outboxKey, status, me]);
	const active = useRef(true);
	const epoch = useRef(0);
	const requests = useRef(new Map<string, SendMessageRequest>());
	const latestLoad = useRef<{ scope: string; promise: Promise<boolean> } | null>(null);
	const olderLoad = useRef<{ scope: string; cursor: string; promise: Promise<boolean> } | null>(null);
	const historyCutoff = useRef<ChatHistoryCutoff>();
	const applyHistoryCutoff = useCallback((cutoff: ChatHistoryCutoff | undefined): boolean => {
		if (!cutoff || !isNewChatHistoryCutoff(cutoff, historyCutoff.current)) return false;
		historyCutoff.current = cutoff;
		latestLoad.current = null;
		olderLoad.current = null;
		cursorRef.current = null;
		setCursor(null);
		setHasFullHistory(false);
		setOlderLoading(false);
		setMessages((current) =>
			current.filter(
				(message) => message.pending || message.sendFailed || chatHistoryTimeOffset(message.createdAt, cutoff) > 0,
			),
		);
		return true;
	}, []);
	useEffect(() => {
		active.current = Boolean(id && me?.member.id);
		historyCutoff.current = undefined;
		latestLoad.current = null;
		olderLoad.current = null;
		cursorRef.current = null;
		setCursor(null);
		setHasFullHistory(false);
		setOlderLoading(false);
		setConversation(undefined);
		setLoading(true);
		setError("");
		setClosedError("");
		setVisitError("");
		sendLock.current = false;
		actionLock.current = false;
		setSending(false);
		requests.current.clear();
		messagesOwner.current = outboxKey;
		try {
			const stored = me?.member.id ? Taro.getStorageSync(outboxKey) : [];
			setMessages(
				Array.isArray(stored)
					? stored.map((message: ChatMessage) => ({ ...message, pending: false, sendFailed: true }))
					: [],
			);
		} catch {
			setMessages([]);
			setError(t("无法读取待发送消息", "Could not read pending messages."));
		}
		return () => {
			active.current = false;
			epoch.current++;
		};
	}, [id, me?.member.id, outboxKey]);
	const load = useCallback(
		(older = false): Promise<boolean> => {
			if (!id || status !== "signed-in" || messagesOwner.current !== outboxKey) return Promise.resolve(false);
			const pageCursor = older ? cursorRef.current : null;
			if (older && !pageCursor) return Promise.resolve(false);
			if (older && olderLoad.current?.scope === outboxKey && olderLoad.current.cursor === pageCursor)
				return olderLoad.current.promise;
			if (!older && latestLoad.current?.scope === outboxKey) return latestLoad.current.promise;
			const ticket = epoch.current;
			let cutoff = historyCutoff.current;
			const currentRequest = () => active.current && ticket === epoch.current && cutoff === historyCutoff.current;
			setError("");
			if (older) setOlderLoading(true);
			const promise = (async () => {
				try {
					let page = await api.messages(id, pageCursor ?? undefined, { markRead: false });
					if (!currentRequest()) return false;
					if (older && page.historyClearedThrough && isNewChatHistoryCutoff(page.historyClearedThrough, cutoff)) {
						// An older cursor from before the clear cannot tell us where current history begins.
						page = await api.messages(id, undefined, { markRead: false });
						if (!currentRequest()) return false;
					}
					if (cutoff && isNewChatHistoryCutoff(cutoff, page.historyClearedThrough)) return false;
					applyHistoryCutoff(page.historyClearedThrough);
					cutoff = historyCutoff.current;
					setMessages((current) => mergeMessages(current, page.items));
					if (older || cursorRef.current === null) {
						cursorRef.current = page.nextCursor;
						setCursor(page.nextCursor);
						if (page.nextCursor === null) setHasFullHistory(true);
					}
					return true;
				} catch {
					if (currentRequest()) setError(t("消息加载失败，请重试", "Could not load messages. Try again."));
					return false;
				} finally {
					if (currentRequest()) {
						if (older) setOlderLoading(false);
						else setLoading(false);
					}
				}
			})();
			if (older && pageCursor) {
				olderLoad.current = { scope: outboxKey, cursor: pageCursor, promise };
				void promise.finally(() => {
					if (olderLoad.current?.promise === promise) olderLoad.current = null;
				});
			} else {
				latestLoad.current = { scope: outboxKey, promise };
				void promise.finally(() => {
					if (latestLoad.current?.promise === promise) latestLoad.current = null;
				});
			}
			return promise;
		},
		[id, status, outboxKey, applyHistoryCutoff],
	);
	const acceptConversation = useCallback(
		(next: Conversation | undefined) => {
			const cutoff = historyCutoff.current;
			if (next && cutoff && isNewChatHistoryCutoff(cutoff, next.historyClearedThrough)) return;
			setConversation(next);
			if (applyHistoryCutoff(next?.historyClearedThrough)) void load();
		},
		[applyHistoryCutoff, load],
	);
	/** A refused send can reflect a change in the visit ladder on the server. */
	const refresh = useCallback((): Promise<void> => {
		const ticket = epoch.current;
		return api
			.conversations()
			.then((result) => {
				if (active.current && ticket === epoch.current) acceptConversation(result.items.find((item) => item.id === id));
			})
			.catch(() => {});
	}, [id, acceptConversation]);
	const acceptMessage = useCallback(
		(message: Message) => {
			const cutoff = historyCutoff.current;
			const offset = cutoff ? chatHistoryTimeOffset(message.createdAt, cutoff) : 1;
			if (offset > 0) setMessages((current) => mergeMessages(current, [message]));
			else {
				if (message.clientNonce)
					setMessages((current) =>
						current.filter((row) => !row.id.startsWith("temp_") || row.clientNonce !== message.clientNonce),
					);
				if (offset === 0 && message.id !== cutoff?.messageId) void load();
			}
		},
		[load],
	);
	const applyQuestionMessages = (card: Message, reply?: Message) => {
		if (!active.current || messagesOwner.current !== outboxKey || card.conversationId !== id) return;
		acceptMessage(card);
		if (reply && reply.conversationId === id) acceptMessage(reply);
	};
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
		void refresh();
		return subscribeEvents((event) => {
			if ((event.type === "message.created" || event.type === "message.updated") && event.message.conversationId === id)
				acceptMessage(event.message);
			if (event.type === "run.updated" && event.run.conversationId === id)
				setMessages((current) => updateRun(current, event.run));
			if (event.type === "conversation.updated" && event.conversation.id === id) acceptConversation(event.conversation);
			if (event.type === "conversation.state_changed" && event.conversationId === id) void refresh();
			// A rename or a new avatar is embedded in the conversation's members, so the copy is patched.
			if (event.type === "member.updated")
				setConversation((current) => (current ? patchConversation(current, event.member) : current));
			// The Bot was deleted elsewhere: its private chat left the account's list, so this open
			// view has nothing left to show and returns to the list (08 第六节, the web client's rule).
			if (event.type === "conversation.removed" && event.conversationId === id) {
				if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
				else void Taro.reLaunch({ url: "/pages/conversations/index" });
			}
		});
	}, [id, status, load, refresh, acceptConversation, acceptMessage]);
	const send = async (body: string, attachments: Attachment[], skillIds: string[], retryNonce?: string) => {
		if (sendLock.current || !id || messagesOwner.current !== outboxKey) return;
		sendLock.current = true;
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
		setClosedError("");
		setVisitError("");
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
		try {
			const stored = Taro.getStorageSync(outboxKey);
			const existing = Array.isArray(stored) ? stored.filter((item: ChatMessage) => item.clientNonce !== nonce) : [];
			Taro.setStorageSync(outboxKey, [...existing, pending]);
		} catch {
			requests.current.delete(nonce);
			sendLock.current = false;
			setSending(false);
			setError(t("无法保存待发送消息，请重试", "Could not save the pending message. Try again."));
			return;
		}
		setMessages((current) => mergeMessages(current, [pending]));
		try {
			const result = await api.sendMessage(id, request);
			if (active.current && ticket === epoch.current)
				acceptMessage({ ...result.message, clientNonce: result.clientNonce });
			requests.current.delete(nonce);
			return true;
		} catch (cause) {
			if (active.current && ticket === epoch.current) {
				// A closed group says so, with the real reason, instead of pretending to retry.
				if (cause instanceof ApiError && cause.code === "conversation_closed") {
					setClosedError(closureText(conversation?.closedReason));
					Taro.removeStorageSync(outboxKey);
					setMessages((current) => current.filter((message) => message.clientNonce !== nonce));
				} else if (cause instanceof ApiError && isVisitErrorCode(cause.code)) {
					// The visit ladder refused it: the server stored nothing, so the pending row goes too, and
					// the refusal is shown as its own red line rather than as something the Bot said.
					setVisitError(t(visitErrorSentence(cause.code, "zh-CN"), visitErrorSentence(cause.code, "en")));
					void refresh();
					try {
						const stored = Taro.getStorageSync(outboxKey);
						if (Array.isArray(stored))
							Taro.setStorageSync(
								outboxKey,
								stored.filter((item: ChatMessage) => item.clientNonce !== nonce),
							);
					} catch {
						// The request was refused either way; a full store must not turn it into a send error.
					}
					setMessages((current) => current.filter((message) => message.clientNonce !== nonce));
				} else {
					setError(t("发送失败，请重试", "Could not send. Try again."));
					setMessages((current) =>
						current.map((message) =>
							message.clientNonce === nonce && message.id.startsWith("temp_")
								? { ...message, pending: false, sendFailed: true }
								: message,
						),
					);
				}
			}
			return false;
		} finally {
			if (active.current && ticket === epoch.current) {
				sendLock.current = false;
				setSending(false);
			}
		}
	};
	const action = async (message: ChatMessage) => {
		if (
			!message.sendFailed &&
			(message.streaming || message.run?.status !== "failed" || message.run.canRetry === false)
		)
			return;
		if (actionLock.current || messagesOwner.current !== outboxKey) return;
		actionLock.current = true;
		const ticket = epoch.current;
		setError("");
		try {
			if (message.sendFailed) {
				await send(message.body ?? "", message.attachments, message.skillIds ?? [], message.clientNonce ?? undefined);
				return;
			}
			const result = await api.retryMessage(message.run?.userMessageId ?? message.id, newNonce());
			if (active.current && ticket === epoch.current) acceptMessage(result.message);
		} catch {
			if (active.current && ticket === epoch.current)
				setError(t("操作失败，请重试", "Could not complete the action. Try again."));
		} finally {
			if (active.current && ticket === epoch.current) actionLock.current = false;
		}
	};
	/** The owner's decision, or the visitor paying for the rest; the answer is the whole conversation. */
	const visitAction = async (action: "approve" | "deny" | "pay", hostPays = false) => {
		const visitId = conversation?.visit?.id;
		if (actionLock.current || !visitId || !id) return;
		actionLock.current = true;
		const ticket = epoch.current;
		setError("");
		try {
			const next =
				action === "approve"
					? await api.approveVisit(visitId, { hostPays })
					: action === "deny"
						? await api.denyVisit(visitId)
						: await api.payVisit(visitId);
			if (active.current && ticket === epoch.current) setConversation(next);
		} catch (cause) {
			if (active.current && ticket === epoch.current)
				setError(
					cause instanceof ApiError && isVisitErrorCode(cause.code)
						? t(visitErrorSentence(cause.code, "zh-CN"), visitErrorSentence(cause.code, "en"))
						: t("操作失败，请重试", "Could not complete the action. Try again."),
				);
		} finally {
			if (active.current && ticket === epoch.current) actionLock.current = false;
		}
	};
	return {
		me,
		messages: status === "signed-in" && messagesOwner.current === outboxKey ? messages : [],
		conversation: messagesOwner.current === outboxKey ? conversation : undefined,
		loading: messagesOwner.current === outboxKey ? loading : true,
		error: messagesOwner.current === outboxKey ? error : "",
		closedError: messagesOwner.current === outboxKey ? closedError : "",
		visitError: messagesOwner.current === outboxKey ? visitError : "",
		cursor: messagesOwner.current === outboxKey ? cursor : null,
		hasFullHistory: messagesOwner.current === outboxKey && hasFullHistory,
		olderLoading: messagesOwner.current === outboxKey && olderLoading,
		sending: messagesOwner.current === outboxKey && sending,
		load,
		applyQuestionMessages,
		send,
		action,
		visitAction,
	};
}
