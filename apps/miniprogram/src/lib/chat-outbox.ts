import Taro from "@tarojs/taro";
import { ApiError, NetworkError } from "@yonder/api-client";
import type { Attachment, Message, SendMessageRequest, SendMessageResponse } from "@yonder/protocol";

export type LocalChatFile = {
	key: string;
	path: string;
	name: string;
	size: number;
	kind: "image" | "file";
};
export type OutboxMessage = Message & {
	pending?: boolean;
	sendFailed?: boolean;
	deliveryError?: string;
	skillIds?: string[];
	localFiles?: LocalChatFile[];
	outboxSource?: string;
};

const prefix = "yonder.mini.outbox.";
export const chatOutboxKey = (owner: string, conversation: string) => `${prefix}${owner}.${conversation}`;
const preview = () => process.env.TARO_ENV === "h5";

function releaseFiles(files: LocalChatFile[] = []): void {
	if (preview()) return;
	for (const { path } of files)
		try {
			Taro.getFileSystemManager().unlinkSync(path);
		} catch {
			// WeChat can clean its files before the outbox does.
		}
}

type Delivery = { message: OutboxMessage; refusal?: ApiError };

export function createChatOutbox(options: {
	source: string;
	owner(): string | null;
	ready?(): boolean;
	send(conversationId: string, request: SendMessageRequest): Promise<SendMessageResponse>;
	upload(path: string, nonce: string): Promise<Attachment>;
	cache?(owner: string, message: Message): void;
}) {
	const listeners = new Set<(key: string, delivery: Delivery) => void>();
	const active = new Map<string, Promise<void>>();
	let retry: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;
	let retryDelay = 1000;

	function emit(key: string, delivery: Delivery) {
		for (const listener of listeners) listener(key, delivery);
	}
	function read(key: string): OutboxMessage[] {
		const stored = Taro.getStorageSync(key);
		return Array.isArray(stored) ? stored : [];
	}
	function visible(key: string) {
		return read(key).flatMap((row) => {
			if (!row.outboxSource) return [{ ...row, pending: false, sendFailed: true }];
			return row.outboxSource === options.source ? [row] : [];
		});
	}
	function replace(key: string, nonce: string, next?: OutboxMessage) {
		const rows = [...read(key)];
		const index = rows.findIndex(({ clientNonce }) => clientNonce === nonce);
		if (index < 0 && next) rows.push(next);
		else if (index >= 0) rows.splice(index, 1, ...(next ? [next] : []));
		Taro.setStorageSync(key, rows);
	}
	function confirm(message: Message) {
		const owner = options.owner();
		if (!owner || !message.clientNonce || message.senderId !== owner) return false;
		const key = chatOutboxKey(owner, message.conversationId);
		try {
			const row = visible(key).find(({ clientNonce }) => clientNonce === message.clientNonce);
			if (!row) return true;
			options.cache?.(owner, message);
			replace(key, message.clientNonce);
			releaseFiles(row.localFiles);
		} catch {
			// A saved nonce still makes a later replay safe.
			schedule();
			return false;
		}
		emit(key, { message });
		return true;
	}
	function schedule() {
		if (retry) return;
		retry = setTimeout(resume, retryDelay);
		retryDelay = Math.min(retryDelay * 2, 30000);
	}
	function drain(key: string, owner: string) {
		if (active.has(key) || options.ready?.() === false) return;
		const ticket = generation;
		const current = () => generation === ticket && options.owner() === owner;
		const task = Promise.resolve()
			.then(async () => {
				while (current()) {
					const row = visible(key).find(({ pending }) => pending);
					if (!row?.clientNonce) return;
					const nonce = row.clientNonce;
					try {
						const attachmentIds = [];
						for (const attachment of row.attachments) {
							const file = row.localFiles?.find(({ key }) => key === attachment.id);
							if (file && !preview()) Taro.getFileSystemManager().accessSync(file.path);
							attachmentIds.push(file ? (await options.upload(file.path, file.key)).id : attachment.id);
							if (!current()) return;
						}
						if (!visible(key).some(({ clientNonce }) => clientNonce === nonce)) continue;
						const result = await options.send(row.conversationId, {
							type: "text",
							body: row.body ?? "",
							attachmentIds,
							...(row.skillIds?.length ? { skillIds: row.skillIds } : {}),
							clientNonce: nonce,
						});
						if (!current()) return;
						retryDelay = 1000;
						if (!confirm({ ...result.message, clientNonce: result.clientNonce })) return;
					} catch (cause) {
						if (!current()) return;
						if (!visible(key).some(({ clientNonce }) => clientNonce === nonce)) continue;
						if (cause instanceof NetworkError || (cause instanceof ApiError && cause.status >= 500)) {
							schedule();
							return;
						}
						const refusal = cause instanceof ApiError ? cause : undefined;
						const message = { ...row, pending: false, sendFailed: true, deliveryError: refusal?.code };
						replace(key, nonce, message);
						emit(key, { message, refusal });
					}
				}
			})
			.catch(() => {
				if (current()) schedule();
			})
			.finally(() => {
				if (active.get(key) === task) active.delete(key);
			});
		active.set(key, task);
	}
	function resume() {
		clearTimeout(retry);
		retry = undefined;
		const owner = options.owner();
		if (!owner) return;
		const ticket = generation;
		try {
			for (const key of Taro.getStorageInfoSync().keys) {
				if (!key.startsWith(`${prefix}${owner}.`)) continue;
				const delivering = active.get(key);
				if (delivering) {
					void delivering.then(() => {
						if (ticket === generation && options.owner() === owner) drain(key, owner);
					});
				} else drain(key, owner);
			}
		} catch {
			// A later app show or reconnect can try again if local storage is unavailable.
		}
	}
	return {
		read: visible,
		confirm,
		resume,
		clear() {
			generation++;
			clearTimeout(retry);
			retry = undefined;
			retryDelay = 1000;
			active.clear();
			try {
				for (const key of Taro.getStorageInfoSync().keys) {
					if (!key.startsWith(prefix)) continue;
					try {
						for (const row of read(key)) releaseFiles(row.localFiles);
					} catch {
						// Keep clearing the other drafts when this one cannot be read.
					}
				}
			} catch {
				// Queue cancellation does not depend on being able to list saved files.
			}
		},
		subscribe(listener: (key: string, delivery: Delivery) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		enqueue(row: OutboxMessage, files: LocalChatFile[]) {
			const owner = options.owner();
			if (!owner || owner !== row.senderId || !row.clientNonce) return;
			const key = chatOutboxKey(owner, row.conversationId);
			const saved: LocalChatFile[] = [];
			try {
				const rows = visible(key);
				const previous = rows.find((entry) => entry.clientNonce === row.clientNonce);
				if (previous?.pending) return true;
				for (const file of files) {
					const extension = file.name.match(/\.[a-z0-9]{1,12}$/i)?.[0] ?? "";
					const path = preview() ? file.path : `${Taro.env.USER_DATA_PATH}/yonder-outbox-${file.key}${extension}`;
					if (!preview()) Taro.getFileSystemManager().copyFileSync(file.path, path);
					saved.push({ ...file, path });
				}
				const message = {
					...row,
					createdAt:
						previous?.createdAt ??
						new Date(Math.max(Date.now(), (Date.parse(rows.at(-1)?.createdAt ?? "") || 0) + 1)).toISOString(),
					pending: true,
					sendFailed: false,
					deliveryError: undefined,
					outboxSource: options.source,
					localFiles: saved.length ? saved : row.localFiles,
				};
				replace(key, row.clientNonce, message);
				emit(key, { message });
				drain(key, owner);
				return true;
			} catch (cause) {
				releaseFiles(saved);
				throw cause;
			}
		},
	};
}
