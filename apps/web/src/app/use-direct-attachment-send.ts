import type { Attachment, SendMessageRequest } from "@yonder/protocol";
import {
	attachmentCacheKey,
	chatCacheGeneration,
	outboxCacheKey,
	readChatCache,
	removeChatCache,
	updateChatCache,
	writeChatCache,
} from "@yonder/ui-data";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	AttachmentTooLargeError,
	CHAT_ATTACHMENT_LIMIT,
	canAttachFile,
	type DraftFile,
	draftFile,
} from "./use-chat-draft.ts";

type Upload = { nonce: string; files: DraftFile[] };
type Failure = { key: string; upload: Upload };

function removeUpload(key: string, nonce: string, generation = chatCacheGeneration()) {
	return updateChatCache<Upload>(key, (upload) => (upload?.nonce === nonce ? undefined : upload), generation);
}

export function useDirectAttachmentSend({
	owner,
	conversation,
	uploadFile,
	send,
	knownNonce,
}: {
	owner: string | undefined;
	conversation: string | undefined;
	uploadFile: (file: DraftFile, signal: AbortSignal) => Promise<{ attachment: Attachment; blob: Blob }>;
	send: (request: SendMessageRequest & { attachments: Attachment[] }) => Promise<unknown>;
	knownNonce: (nonce: string) => boolean;
}) {
	const key = owner && conversation ? `direct-attachment-upload:${owner}:${conversation}` : "";
	const visibleKey = useRef(key);
	visibleKey.current = key;
	const [loadedKey, setLoadedKey] = useState("");
	const [sendingKey, setSendingKey] = useState("");
	const [failed, setFailed] = useState<Failure>();
	const [error, setError] = useState<{ key: string; message: string }>();
	const inFlight = useRef<{ key: string; controller: AbortController } | undefined>(undefined);

	useLayoutEffect(() => {
		if (!owner || !conversation || !key) return;
		let active = true;
		void (async () => {
			try {
				const upload = await readChatCache<Upload>(key);
				if (!active || !upload) return;
				const queued = await readChatCache(outboxCacheKey(owner, conversation, upload.nonce));
				if (!active) return;
				if (queued) {
					await removeUpload(key, upload.nonce);
				} else setFailed({ key, upload });
			} catch {
				if (active) setError({ key, message: "chat.cacheFailed" });
			} finally {
				if (active) setLoadedKey(key);
			}
		})();
		return () => {
			active = false;
			setLoadedKey("");
			const interrupted = inFlight.current;
			if (interrupted?.key === key) {
				inFlight.current = undefined;
				interrupted.controller.abort();
				setSendingKey("");
			}
		};
	}, [conversation, key, owner]);

	const uploadToRetry = failed?.key === key ? failed.upload : undefined;
	const postedNonce = uploadToRetry && knownNonce(uploadToRetry.nonce) ? uploadToRetry.nonce : undefined;
	useEffect(() => {
		if (!postedNonce) return;
		setFailed((previous) => (previous?.upload.nonce === postedNonce ? undefined : previous));
		void removeUpload(key, postedNonce).catch(() => {});
	}, [postedNonce, key]);

	async function run(upload: Upload, retrying = false) {
		if (!owner || !conversation || !key || visibleKey.current !== key || loadedKey !== key || inFlight.current) return;
		const controller = new AbortController();
		const active = { key, controller };
		const generation = chatCacheGeneration();
		const interrupted = () =>
			controller.signal.aborted || visibleKey.current !== key || generation !== chatCacheGeneration();
		inFlight.current = active;
		setSendingKey(key);
		setError(undefined);
		if (!retrying) setFailed(undefined);
		const staged: { attachment: Attachment; blob: Blob }[] = [];
		let handedOff = false;
		try {
			if (!retrying)
				await writeChatCache(key, upload, generation).catch(() => {
					if (!interrupted()) setError({ key, message: "chat.cacheFailed" });
				});
			for (const file of upload.files) {
				if (interrupted()) return;
				staged.push(await uploadFile(file, controller.signal));
			}
			if (interrupted()) return;

			// The existing timeline outbox owns retries as soon as the message mutation creates its entry.
			for (const { attachment, blob } of staged)
				void writeChatCache(attachmentCacheKey(owner, attachment.id), blob, generation).catch(() => {});
			const attachments = staged.map(({ attachment }) => attachment);
			handedOff = true;
			await send({
				type: "text",
				body: "",
				clientNonce: upload.nonce,
				attachmentIds: attachments.map(({ id }) => id),
				attachments,
			});
			if (generation === chatCacheGeneration())
				for (const { id } of attachments) void removeChatCache(attachmentCacheKey(owner, id)).catch(() => {});
		} catch (cause) {
			if (!handedOff && !interrupted()) {
				if (cause instanceof AttachmentTooLargeError) setError({ key, message: "chat.fileTooLarge" });
				setFailed({ key, upload });
			}
		} finally {
			if (handedOff) await removeUpload(key, upload.nonce, generation).catch(() => {});
			if (inFlight.current === active) {
				inFlight.current = undefined;
				setSendingKey("");
				if (handedOff) setFailed(undefined);
			}
		}
	}

	return {
		enabled: Boolean(key),
		ready: !key || loadedKey === key,
		sending: Boolean(key && sendingKey === key),
		failed: Boolean(uploadToRetry && !postedNonce),
		error: error?.key === key ? error.message : "",
		send: (files: File[], sendOriginal: boolean) => {
			if (!files.length || uploadToRetry || visibleKey.current !== key) return;
			if (files.length > CHAT_ATTACHMENT_LIMIT || files.some((file) => !canAttachFile(file, sendOriginal))) {
				setError({ key, message: files.length > CHAT_ATTACHMENT_LIMIT ? "chat.tooManyFiles" : "chat.fileTooLarge" });
				return;
			}
			void run({ nonce: crypto.randomUUID(), files: files.map((file) => ({ ...draftFile(file), sendOriginal })) });
		},
		retry: () => {
			if (uploadToRetry && !postedNonce) void run(uploadToRetry, true);
		},
		discard: () => {
			if (!uploadToRetry || inFlight.current || visibleKey.current !== key) return;
			void removeUpload(key, uploadToRetry.nonce).then(
				() => {
					if (visibleKey.current !== key) return;
					setFailed(undefined);
					setError(undefined);
				},
				() => {
					if (visibleKey.current === key) setError({ key, message: "chat.cacheFailed" });
				},
			);
		},
	};
}
