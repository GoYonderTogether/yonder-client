import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { ApiError, type Endpoints, NetworkError } from "@yonder/api-client";
import type { Attachment, MeResponse, Message, MessagePage, SendMessageRequest } from "@yonder/protocol";
import { keys } from "../query/keys.ts";
import type { CachedMessage } from "../realtime/cached-message.ts";
import { updateMessage } from "../realtime/message-cache.ts";
import {
	chatCacheGeneration,
	LOCAL_OUTBOX_ATTACHMENT,
	listChatCache,
	outboxCacheKey,
	readChatCache,
	removeChatCache,
	updateChatCache,
	writeChatCache,
} from "../storage/chat-cache.ts";
import { loadMedia } from "../storage/media-cache.ts";

export type OutgoingFile = {
	nonce: string;
	name: string;
	mimeType: string;
	kind: Attachment["kind"];
	blob: Blob;
	optimize?: boolean | undefined;
	uploaded?: Attachment | undefined;
};
export type PrepareOutgoingFile = (file: OutgoingFile) => Promise<OutgoingFile>;
export type SendInput = SendMessageRequest & {
	attachments?: Attachment[];
	replyTo?: NonNullable<Message["replyTo"]>;
	files?: OutgoingFile[];
};
export type OutboxRecord = {
	message: CachedMessage;
	request: SendMessageRequest;
	files: OutgoingFile[];
};

const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;
const outboxes = new WeakMap<QueryClient, ChatOutbox>();

export function chatOutbox(client: QueryClient, api: Endpoints) {
	let outbox = outboxes.get(client);
	if (!outbox) {
		outbox = new ChatOutbox(client, api);
		outboxes.set(client, outbox);
	}
	return outbox;
}

export function outgoingMessage(conversationId: string, owner: string, input: SendInput): CachedMessage {
	return {
		id: `temp_${input.clientNonce}`,
		conversationId,
		senderId: owner,
		senderKind: "person",
		type: "text",
		body: input.body,
		attachments: input.attachments ?? [],
		...(input.voice ? { voice: { durationMs: input.voice.durationMs } } : {}),
		...(input.type === "voice" ? { sendType: input.type } : {}),
		replyToId: input.replyToId ?? null,
		...(input.replyTo ? { replyTo: input.replyTo } : {}),
		createdAt: new Date().toISOString(),
		editedAt: null,
		streaming: false,
		version: 0,
		clientNonce: input.clientNonce,
		pending: true,
		...(input.skillIds ? { skillIds: input.skillIds } : {}),
		...(input.mentionedMemberIds ? { mentionedMemberIds: input.mentionedMemberIds } : {}),
	};
}

export function showOutgoingMessage(client: QueryClient, message: CachedMessage) {
	const history = keys.messages.latest(message.conversationId);
	if (!client.getQueryData(history))
		client.setQueryData<InfiniteData<MessagePage>>(
			history,
			{ pages: [{ items: [], nextCursor: null, hasMore: false }], pageParams: [undefined] },
			{ updatedAt: 0 },
		);
	updateMessage(client, message);
}

class ChatOutbox {
	constructor(
		private readonly client: QueryClient,
		private readonly api: Endpoints,
	) {}

	private accessToken: (() => string | null) | undefined;
	private refreshSession: (() => Promise<boolean>) | undefined;
	private prepare: PrepareOutgoingFile | undefined;
	private authenticated: { token: string; member: Promise<string | undefined> } | undefined;
	private active = new Set<string>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private retryDelay = MIN_RETRY_MS;
	private lastEnqueuedAt = 0;

	start(accessToken: () => string | null, refreshSession: () => Promise<boolean>, prepare?: PrepareOutgoingFile) {
		this.accessToken = accessToken;
		this.refreshSession = refreshSession;
		this.prepare = prepare;
		this.resume();
		return () => {
			this.accessToken = undefined;
			this.refreshSession = undefined;
			this.authenticated = undefined;
			clearTimeout(this.timer);
			this.timer = undefined;
		};
	}

	resume() {
		clearTimeout(this.timer);
		this.timer = undefined;
		this.retryDelay = MIN_RETRY_MS;
		this.flush();
	}

	private owner() {
		return this.client.getQueryData<MeResponse>(keys.me())?.member.id;
	}

	async enqueue(conversation: string, owner: string, input: SendInput) {
		const generation = chatCacheGeneration();
		if (this.owner() !== owner) throw new Error("session_changed");
		const { attachments, files = [], replyTo: _replyTo, ...request } = input;
		const key = outboxCacheKey(owner, conversation, request.clientNonce);
		const existing = await readChatCache<OutboxRecord | CachedMessage>(key);
		if (existing && "request" in existing) {
			this.flush();
			return;
		}
		const message = outgoingMessage(conversation, owner, input);
		message.queuedLocally = true;
		this.lastEnqueuedAt = Math.max(Date.now(), this.lastEnqueuedAt + 1);
		message.createdAt = new Date(this.lastEnqueuedAt).toISOString();
		const prefix = `${LOCAL_OUTBOX_ATTACHMENT}${encodeURIComponent(conversation)}:${encodeURIComponent(request.clientNonce)}:`;
		message.attachments = [
			...(attachments ?? []),
			...files.map(({ kind, name, mimeType, blob }, index) => ({
				id: `${prefix}${index}`,
				kind,
				name,
				mimeType,
				size: blob.size,
			})),
		];
		await writeChatCache(key, { message, request, files } satisfies OutboxRecord, generation);
		if (generation !== chatCacheGeneration() || this.owner() !== owner) throw new Error("session_changed");
		showOutgoingMessage(this.client, message);
		this.flush();
	}

	async retry(conversation: string, owner: string, nonce: string) {
		const record = await updateChatCache<OutboxRecord | CachedMessage>(
			outboxCacheKey(owner, conversation, nonce),
			(current) =>
				current && "request" in current
					? { ...current, message: { ...current.message, pending: true, sendFailed: false } }
					: current,
		);
		if (!record || !("request" in record) || owner !== this.owner()) return false;
		updateMessage(this.client, record.message);
		this.flush();
		return true;
	}

	private retryLater() {
		if (this.timer || !this.accessToken || globalThis.navigator?.onLine === false) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.flush();
		}, this.retryDelay);
		this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
	}

	private flush() {
		const owner = this.owner();
		const token = this.accessToken?.();
		if (!owner || !token || this.timer || globalThis.navigator?.onLine === false) return;
		const generation = chatCacheGeneration();
		void listChatCache<OutboxRecord | CachedMessage>(`outbox:${owner}:`)
			.then(async (entries) => {
				const queued = entries.filter((entry): entry is OutboxRecord => "request" in entry && !!entry.message.pending);
				if (
					!queued.length ||
					(await this.getAuthenticatedMember(token)) !== owner ||
					this.owner() !== owner ||
					generation !== chatCacheGeneration()
				)
					return;
				if (this.accessToken?.() !== token) {
					this.flush();
					return;
				}
				queued.sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt));
				for (const entry of queued) {
					const { conversationId } = entry.message;
					const activeKey = `${generation}:${conversationId}`;
					if (this.active.has(activeKey)) continue;
					this.active.add(activeKey);
					void this.deliver(owner, entry, generation, token).finally(() => {
						this.active.delete(activeKey);
						this.flush();
					});
				}
			})
			.catch(() => {});
	}

	private getAuthenticatedMember(token: string) {
		if (this.authenticated?.token !== token) {
			this.authenticated = {
				token,
				member: this.api.me().then(
					(me) => me.member.id,
					() => {
						if (this.authenticated?.token === token) this.authenticated = undefined;
						this.retryLater();
						return undefined;
					},
				),
			};
		}
		return this.authenticated.member;
	}

	private async deliver(owner: string, entry: OutboxRecord, generation: number, token: string) {
		const { conversationId } = entry.message;
		const key = outboxCacheKey(owner, conversationId, entry.request.clientNonce);
		const currentSession = () => this.owner() === owner && generation === chatCacheGeneration();
		const authorized = () => currentSession() && this.accessToken?.() === token;
		try {
			const current = await readChatCache<OutboxRecord>(key);
			if (!current?.message?.pending || !authorized()) return;
			const remoteIds = [...(current.request.attachmentIds ?? [])];
			for (const [index, file] of current.files.entries()) {
				const save = (update: OutgoingFile) =>
					updateChatCache<OutboxRecord>(
						key,
						(record) => {
							if (!record) return;
							const files = [...record.files];
							files[index] = update;
							return { ...record, files };
						},
						generation,
					);
				const prepared = !file.uploaded && this.prepare ? await this.prepare(file) : file;
				if (prepared !== file && !(await save(prepared))) return;
				if (!(await readChatCache(key)) || !authorized()) return;
				const attachment =
					prepared.uploaded ??
					(await this.api.uploadAttachment(
						new File([prepared.blob], prepared.name, { type: prepared.mimeType }),
						prepared.nonce,
						undefined,
						{ retried: true },
					));
				if (!currentSession() || (!prepared.uploaded && !(await save({ ...prepared, uploaded: attachment })))) return;
				remoteIds.push(attachment.id);
				await loadMedia(owner, { attachmentId: attachment.id }, "original", {
					sign: async () => ({ url: null }),
					local: async () => prepared.blob,
				}).catch(() => {});
			}
			if (!(await readChatCache(key)) || !authorized()) return;
			// A refresh cookie can belong to a different account in another tab. Let the next
			// worker pass verify the refreshed identity before retrying this write.
			const result = await this.api.sendMessage(
				conversationId,
				{ ...current.request, ...(remoteIds.length ? { attachmentIds: remoteIds } : {}) },
				{ retried: true },
			);
			if (!currentSession()) return;
			await removeChatCache(key);
			updateMessage(this.client, { ...result.message, clientNonce: result.clientNonce });
			this.retryDelay = MIN_RETRY_MS;
			void this.client.invalidateQueries({ queryKey: keys.conversations.list() });
		} catch (error) {
			if (!currentSession()) return;
			if (error instanceof ApiError && error.status === 401) {
				if (!authorized()) return;
				this.authenticated = undefined;
				try {
					if (await this.refreshSession?.()) this.retryLater();
				} catch {
					this.retryLater();
				}
				return;
			}
			if (
				error instanceof NetworkError ||
				(error instanceof ApiError && (error.status >= 500 || error.code === "compact_busy"))
			) {
				this.retryLater();
				return;
			}
			const failed = await updateChatCache<OutboxRecord>(
				key,
				(record) => record && { ...record, message: { ...record.message, pending: false, sendFailed: true } },
				generation,
			).catch(() => undefined);
			if (failed && currentSession()) updateMessage(this.client, failed.message);
		}
	}
}
