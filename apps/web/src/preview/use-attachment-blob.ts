import type { Attachment } from "@yonder/protocol";
import {
	attachmentCacheKey,
	chatCacheGeneration,
	type ImageVariant,
	readChatCache,
	useApi,
	usePerson,
	writeChatCache,
} from "@yonder/ui-data";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useImageBlob } from "./use-image-blob.ts";

export function useAttachmentBlob(attachment: Attachment, variant: ImageVariant = "original", persistent = true) {
	const api = useApi();
	const { id, mimeType } = attachment;
	const privateImage = mimeType.toLowerCase().startsWith("image/") && mimeType !== "image/svg+xml";
	const image = useImageBlob(
		useMemo(
			() =>
				privateImage
					? {
							resource: { attachmentId: id },
							variant,
							persistent,
							sign: () => api.attachmentDownload(id, variant),
							local: () => api.attachmentContent(id),
						}
					: undefined,
			[api, id, privateImage, persistent, variant],
		),
	);
	const legacy = useLegacyAttachmentBlob(attachment, !privateImage, persistent);
	return privateImage ? { ...legacy, ...image } : legacy;
}

/** Original bytes stay account-scoped; a late fetch cannot repopulate an exited account's cache. */
function useLegacyAttachmentBlob(attachment: Attachment, enabled: boolean, persistent: boolean) {
	const api = useApi();
	const owner = usePerson()?.id;
	const key = owner && enabled ? attachmentCacheKey(owner, attachment.id) : "";
	const current = useRef(key);
	current.current = key;
	const mounted = useRef(true);
	const loaded = useRef<{ key: string; blob: Blob } | undefined>(undefined);
	const pending = useRef<{ key: string; promise: Promise<Blob | undefined> } | undefined>(undefined);
	const [blob, setBlob] = useState<Blob>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const [cacheError, setCacheError] = useState(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		setBlob(undefined);
		if (loaded.current?.key !== key) loaded.current = undefined;
		setError(false);
	}, [key]);
	const load = useCallback(async () => {
		if (!key) return;
		if (loaded.current?.key === key) return loaded.current.blob;
		if (pending.current?.key === key) return pending.current.promise;
		const generation = chatCacheGeneration();
		setLoading(true);
		setError(false);
		const operation = (async () => {
			try {
				const cached = persistent ? await readChatCache<Blob>(key).catch(() => undefined) : undefined;
				const content = cached ?? (await api.attachmentContent(attachment.id));
				if (generation !== chatCacheGeneration() || current.current !== key) return;
				loaded.current = { key, blob: content };
				if (mounted.current) setBlob(content);
				if (persistent && !cached)
					await writeChatCache(key, content, generation).catch(() => {
						if (mounted.current) setCacheError(true);
					});
				return content;
			} catch {
				if (mounted.current && current.current === key) setError(true);
			} finally {
				if (mounted.current && current.current === key) setLoading(false);
				pending.current = undefined;
			}
		})();
		pending.current = { key, promise: operation };
		return operation;
	}, [api, key, attachment.id, persistent]);
	const loadPart = async (id: string) => {
		if (id === attachment.id) return load();
		if (!owner) return;
		const generation = chatCacheGeneration();
		const partKey = attachmentCacheKey(owner, id);
		const cached = persistent ? await readChatCache<Blob>(partKey).catch(() => undefined) : undefined;
		if (generation !== chatCacheGeneration() || current.current !== key) return;
		const content = cached ?? (await api.attachmentContent(id));
		if (generation !== chatCacheGeneration() || current.current !== key) return;
		if (persistent && !cached) void writeChatCache(partKey, content, generation).catch(() => {});
		return content;
	};
	const loadCached = useCallback(async () => {
		if (!key || !persistent) return;
		const generation = chatCacheGeneration();
		const content =
			loaded.current?.key === key ? loaded.current.blob : await readChatCache<Blob>(key).catch(() => undefined);
		if (!content || current.current !== key || generation !== chatCacheGeneration()) return;
		loaded.current = { key, blob: content };
		if (mounted.current) setBlob(content);
		return content;
	}, [key, persistent]);
	return {
		blob: loaded.current?.key === key ? blob : undefined,
		load,
		loadPart,
		loadCached,
		loading,
		error,
		cacheError,
	};
}
