import Taro, { useDidShow } from "@tarojs/taro";
import { ApiError } from "@yonder/api-client";
import { chatHistoryTimeOffset, isNewChatHistoryCutoff } from "@yonder/chat-model";
import type { ChatHistoryCutoff, Conversation, Message, MessagePage } from "@yonder/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { chatOutboxKey, type LocalChatFile } from "../../lib/chat-outbox";
import { t } from "../../lib/i18n";
import { patchConversation } from "../../lib/member-cache";
import { METADATA_FRESH_MS, metadataKey, readSnapshot, updateSnapshots, writeSnapshot } from "../../lib/metadata-cache";
import {
	api,
	chatOutbox,
	invalidateAttachmentMedia,
	newNonce,
	subscribeEvents,
	useRealtimeRevision,
	useSession,
} from "../../lib/runtime";
import { type ChatMessage, mergeMessages, updateRun } from "./model";
import { closureText } from "./sentences";
import { isVisitErrorCode, visitErrorSentence } from "./visits";

export function useChat(id: string) {
	const { me, memberId, status } = useSession();
	const revision = useRealtimeRevision();
	const outboxKey = chatOutboxKey(memberId ?? "", id);
	const historyKey = memberId ? metadataKey(memberId, "messages", id) : "";
	const messagesOwner = useRef(outboxKey);
	const [messages, setMessages] = useState<ChatMessage[]>(() => {
		try {
			const drafts = memberId ? chatOutbox.read(outboxKey) : [];
			return mergeMessages(drafts, (historyKey && readSnapshot<MessagePage>(historyKey)?.data.items) || []);
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
	const [olderLoading, setOlderLoading] = useState(false);
	const [olderError, setOlderError] = useState(false);
	const actionLock = useRef(false);
	const cursorRef = useRef<string | null>(null);
	const active = useRef(true);
	const epoch = useRef(0);
	const latestLoad = useRef<{ scope: string; promise: Promise<boolean> } | null>(null);
	const olderLoad = useRef<{ scope: string; cursor: string; promise: Promise<boolean> } | null>(null);
	const historyCutoff = useRef<ChatHistoryCutoff>();
	const applyHistoryCutoff = useCallback(
		(cutoff: ChatHistoryCutoff | undefined): boolean => {
			if (!cutoff || !isNewChatHistoryCutoff(cutoff, historyCutoff.current)) return false;
			historyCutoff.current = cutoff;
			if (historyKey)
				updateSnapshots<MessagePage>(historyKey, (page) => {
					if (!isNewChatHistoryCutoff(cutoff, page.historyClearedThrough)) return page;
					invalidateAttachmentMedia(
						page.items
							.filter((message) => chatHistoryTimeOffset(message.createdAt, cutoff) <= 0)
							.flatMap((message) => message.attachments.map(({ id }) => id)),
					);
					return undefined;
				});
			latestLoad.current = null;
			olderLoad.current = null;
			cursorRef.current = null;
			setCursor(null);
			setHasFullHistory(false);
			setOlderLoading(false);
			setOlderError(false);
			setMessages((current) =>
				current.filter(
					(message) => message.pending || message.sendFailed || chatHistoryTimeOffset(message.createdAt, cutoff) > 0,
				),
			);
			return true;
		},
		[historyKey],
	);
	useEffect(() => {
		active.current = Boolean(id && memberId);
		historyCutoff.current = undefined;
		latestLoad.current = null;
		olderLoad.current = null;
		cursorRef.current = null;
		setCursor(null);
		setHasFullHistory(false);
		setOlderLoading(false);
		setOlderError(false);
		setConversation(undefined);
		setLoading(true);
		setError("");
		setClosedError("");
		setVisitError("");
		actionLock.current = false;
		messagesOwner.current = outboxKey;
		try {
			const drafts = memberId ? chatOutbox.read(outboxKey) : [];
			const cached = historyKey ? readSnapshot<MessagePage>(historyKey)?.data : undefined;
			setMessages(mergeMessages(drafts, cached?.items ?? []));
			if (cached) setLoading(false);
		} catch {
			setMessages([]);
			setError(t("无法读取待发送消息", "Could not read pending messages."));
		}
		return () => {
			active.current = false;
			epoch.current++;
		};
	}, [id, memberId, outboxKey, historyKey]);
	const load = useCallback(
		(older = false, force = true): Promise<boolean> => {
			if (!id || status !== "signed-in" || messagesOwner.current !== outboxKey) return Promise.resolve(false);
			const pageCursor = older ? cursorRef.current : null;
			if (older && !pageCursor) return Promise.resolve(false);
			if (older && olderLoad.current?.scope === outboxKey) return olderLoad.current.promise;
			if (!older && latestLoad.current?.scope === outboxKey) return latestLoad.current.promise;
			const ticket = epoch.current;
			let cutoff = historyCutoff.current;
			const currentRequest = () => active.current && ticket === epoch.current && cutoff === historyCutoff.current;
			const pageKey = historyKey
				? `${historyKey}${pageCursor ? encodeURIComponent(pageCursor).replaceAll(".", "%2E") : ""}`
				: "";
			const snapshot = pageKey ? readSnapshot<MessagePage>(pageKey) : undefined;
			const cached =
				snapshot && (!cutoff || !isNewChatHistoryCutoff(cutoff, snapshot.data.historyClearedThrough))
					? snapshot
					: undefined;
			const applyPage = (page: MessagePage) => {
				applyHistoryCutoff(page.historyClearedThrough);
				cutoff = historyCutoff.current;
				for (const message of page.items) chatOutbox.confirm(message);
				setMessages((current) => mergeMessages(current, page.items));
				if (older || cursorRef.current === null) {
					cursorRef.current = page.nextCursor;
					setCursor(page.nextCursor);
					if (page.nextCursor === null) setHasFullHistory(true);
				}
			};
			if (cached) {
				applyPage(cached.data);
				setLoading(false);
				if ((!force || older) && Date.now() - cached.savedAt < METADATA_FRESH_MS) return Promise.resolve(true);
			}
			if (older) {
				setOlderError(false);
				setOlderLoading(true);
			} else setError("");
			const promise = (async () => {
				try {
					let page = await api.messages(id, pageCursor ?? undefined, { markRead: false });
					let writeKey = pageKey;
					if (!currentRequest()) return false;
					if (older && page.historyClearedThrough && isNewChatHistoryCutoff(page.historyClearedThrough, cutoff)) {
						// An older cursor from before the clear cannot tell us where current history begins.
						page = await api.messages(id, undefined, { markRead: false });
						writeKey = historyKey;
						if (!currentRequest()) return false;
					}
					if (cutoff && isNewChatHistoryCutoff(cutoff, page.historyClearedThrough)) return false;
					if (cached && writeKey === pageKey) {
						const currentIds = new Set(page.items.map((message) => message.id));
						const oldest = page.items[0];
						const removed = cached.data.items.filter(
							(message) =>
								!currentIds.has(message.id) &&
								(older ||
									!page.nextCursor ||
									(oldest &&
										(message.createdAt > oldest.createdAt ||
											(message.createdAt === oldest.createdAt && message.id >= oldest.id)))),
						);
						if (removed.length) {
							const missing = new Set(removed.map((message) => message.id));
							setMessages((current) => current.filter((message) => !missing.has(message.id)));
							invalidateAttachmentMedia(removed.flatMap((message) => message.attachments.map(({ id }) => id)));
						}
					}
					applyPage(page);
					if (writeKey) writeSnapshot(writeKey, page);
					return true;
				} catch (cause) {
					if (currentRequest()) {
						if (historyKey && cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
							updateSnapshots<MessagePage>(historyKey, (page) => {
								invalidateAttachmentMedia(page.items.flatMap((message) => message.attachments.map(({ id }) => id)));
								return undefined;
							});
							setMessages((current) => current.filter((message) => message.pending || message.sendFailed));
							cursorRef.current = null;
							setCursor(null);
						}
						if (older) setOlderError(true);
						else setError(t("消息加载失败，请重试", "Could not load messages. Try again."));
					}
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
		[id, status, outboxKey, historyKey, applyHistoryCutoff],
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
	const seenRevision = useRef(revision);
	useEffect(() => {
		const reconnected = seenRevision.current !== revision;
		seenRevision.current = revision;
		void load(false, reconnected);
	}, [revision, load]);
	useDidShow(() => {
		if (status === "signed-out") void Taro.reLaunch({ url: "/pages/sign-in/index" });
		else void load(false, false);
	});
	useEffect(() => {
		if (status !== "signed-in") return;
		void load(false, false);
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
	useEffect(() => {
		if (status !== "signed-in") return;
		return chatOutbox.subscribe((key, { message, refusal }) => {
			if (!active.current || key !== outboxKey || messagesOwner.current !== outboxKey) return;
			if (refusal?.code === "conversation_closed") setClosedError(closureText(conversation?.closedReason));
			if (refusal && isVisitErrorCode(refusal.code)) {
				setVisitError(t(visitErrorSentence(refusal.code, "zh-CN"), visitErrorSentence(refusal.code, "en")));
				void refresh();
			}
			if (message.pending || message.sendFailed) {
				setMessages((current) => mergeMessages(current, [message]));
			} else acceptMessage(message);
		});
	}, [acceptMessage, conversation?.closedReason, outboxKey, refresh, status]);
	const enqueue = (row: ChatMessage, files: LocalChatFile[]) => {
		setError("");
		setClosedError("");
		setVisitError("");
		try {
			return chatOutbox.enqueue(row, files);
		} catch {
			setError(t("无法保存待发送消息，请重试", "Could not save the pending message. Try again."));
		}
	};
	const send = (body: string, files: LocalChatFile[], skillIds: string[], retryNonce?: string) => {
		if (!id || !memberId || status !== "signed-in" || messagesOwner.current !== outboxKey) return;
		const nonce = retryNonce ?? newNonce();
		return enqueue(
			{
				id: `temp_${nonce}`,
				conversationId: id,
				senderId: memberId,
				senderKind: "person",
				type: "text",
				body,
				attachments: files.map(({ key, kind, name, size }) => ({ id: key, kind, name, size, mimeType: "" })),
				replyToId: null,
				createdAt: new Date().toISOString(),
				editedAt: null,
				streaming: false,
				version: 0,
				clientNonce: nonce,
				skillIds,
			},
			files,
		);
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
				enqueue({ ...message, clientNonce: message.clientNonce ?? newNonce() }, []);
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
		memberId,
		messages: status === "signed-in" && messagesOwner.current === outboxKey ? messages : [],
		conversation: messagesOwner.current === outboxKey ? conversation : undefined,
		loading: messagesOwner.current === outboxKey ? loading : true,
		error: messagesOwner.current === outboxKey ? error : "",
		closedError: messagesOwner.current === outboxKey ? closedError : "",
		visitError: messagesOwner.current === outboxKey ? visitError : "",
		cursor: messagesOwner.current === outboxKey ? cursor : null,
		hasFullHistory: messagesOwner.current === outboxKey && hasFullHistory,
		olderLoading: messagesOwner.current === outboxKey && olderLoading,
		olderError: messagesOwner.current === outboxKey && olderError,
		load,
		applyQuestionMessages,
		send,
		action,
		visitAction,
	};
}
