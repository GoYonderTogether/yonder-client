import type { SendMessageRequest } from "@yonder/protocol";
import {
	chatCacheGeneration,
	type OutgoingFile,
	outboxCacheKey,
	readChatCache,
	updateChatCache,
	writeChatCache,
} from "@yonder/ui-data";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type DraftQuote, quoteInput } from "./composer-quote.tsx";
import { CHAT_ATTACHMENT_LIMIT, canAttachFile, type DraftFile, draftFile, outgoingFile } from "./draft-file.ts";

type Upload = { nonce: string; files: DraftFile[]; quote?: DraftQuote | undefined };
type Failure = { key: string; upload: Upload };

function removeUpload(key: string, nonce: string, generation = chatCacheGeneration()) {
	return updateChatCache<Upload>(key, (upload) => (upload?.nonce === nonce ? undefined : upload), generation);
}

export function useDirectAttachmentSend({
	owner,
	conversation,
	send,
	quote,
	onQuotedSend,
	knownNonce,
}: {
	owner: string | undefined;
	conversation: string | undefined;
	send: (request: SendMessageRequest & { files: OutgoingFile[] } & ReturnType<typeof quoteInput>) => Promise<unknown>;
	quote?: DraftQuote | undefined;
	onQuotedSend?: (id: string) => void;
	knownNonce: (nonce: string) => boolean;
}) {
	const key = owner && conversation ? `direct-attachment-upload:${owner}:${conversation}` : "";
	const visibleKey = useRef(key);
	visibleKey.current = key;
	const [loadedKey, setLoadedKey] = useState("");
	const [failed, setFailed] = useState<Failure>();
	const [error, setError] = useState<{ key: string; message: string }>();
	const inFlight = useRef<string | undefined>(undefined);

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
		};
	}, [conversation, key, owner]);

	const uploadToRetry = failed?.key === key ? failed.upload : undefined;
	const postedNonce = uploadToRetry && knownNonce(uploadToRetry.nonce) ? uploadToRetry.nonce : undefined;
	useEffect(() => {
		if (!postedNonce) return;
		setFailed((previous) => (previous?.upload.nonce === postedNonce ? undefined : previous));
		void removeUpload(key, postedNonce).catch(() => {});
	}, [postedNonce, key]);

	async function run(upload: Upload) {
		if (!key || visibleKey.current !== key || inFlight.current) return;
		const generation = chatCacheGeneration();
		const visible = () => visibleKey.current === key && generation === chatCacheGeneration();
		inFlight.current = upload.nonce;
		setError(undefined);
		try {
			await send({
				type: "text",
				body: "",
				clientNonce: upload.nonce,
				files: upload.files.map(outgoingFile),
				...quoteInput(upload.quote),
			});
			if (visible()) {
				if (upload.quote) onQuotedSend?.(upload.quote.replyTo.id);
				setFailed(undefined);
			}
			void removeUpload(key, upload.nonce, generation).catch(() => {});
		} catch {
			if (generation === chatCacheGeneration()) {
				void writeChatCache(key, upload, generation).catch(() => {});
				if (visible()) setFailed({ key, upload });
			}
		} finally {
			inFlight.current = undefined;
		}
	}

	return {
		enabled: Boolean(key),
		ready: !key || loadedKey === key,
		failed: Boolean(uploadToRetry && !postedNonce),
		error: error?.key === key ? error.message : "",
		send: (files: File[], sendOriginal: boolean) => {
			if (!files.length || uploadToRetry || visibleKey.current !== key) return;
			if (files.length > CHAT_ATTACHMENT_LIMIT || files.some((file) => !canAttachFile(file, sendOriginal))) {
				setError({ key, message: files.length > CHAT_ATTACHMENT_LIMIT ? "chat.tooManyFiles" : "chat.fileTooLarge" });
				return;
			}
			void run({
				nonce: crypto.randomUUID(),
				quote,
				files: files.map((file) => ({ ...draftFile(file), sendOriginal })),
			});
		},
		retry: () => {
			if (uploadToRetry && !postedNonce) void run(uploadToRetry);
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
