import type { Attachment } from "@yonder/protocol";
import {
	attachmentCacheKey,
	chatCacheGeneration,
	readChatCache,
	useApi,
	usePerson,
	writeChatCache,
} from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";

/** Original bytes stay account-scoped; a late fetch cannot repopulate an exited account's cache. */
export function useAttachmentBlob(attachment: Attachment) {
	const api = useApi();
	const owner = usePerson()?.id;
	const key = owner ? attachmentCacheKey(owner, attachment.id) : "";
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
				const cached = await readChatCache<Blob>(key).catch(() => undefined);
				const content = cached ?? (await api.attachmentContent(attachment.id));
				if (generation !== chatCacheGeneration() || current.current !== key) return;
				loaded.current = { key, blob: content };
				if (mounted.current) setBlob(content);
				if (!cached)
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
	}, [api, key, attachment.id]);
	const loadPart = async (id: string) => {
		if (id === attachment.id) return load();
		if (!owner) return;
		const generation = chatCacheGeneration();
		const partKey = attachmentCacheKey(owner, id);
		const cached = await readChatCache<Blob>(partKey).catch(() => undefined);
		if (generation !== chatCacheGeneration() || current.current !== key) return;
		const content = cached ?? (await api.attachmentContent(id));
		if (generation !== chatCacheGeneration() || current.current !== key) return;
		if (!cached) void writeChatCache(partKey, content, generation).catch(() => {});
		return content;
	};
	const loadCached = useCallback(async () => {
		if (!key) return;
		const generation = chatCacheGeneration();
		const content =
			loaded.current?.key === key ? loaded.current.blob : await readChatCache<Blob>(key).catch(() => undefined);
		if (!content || current.current !== key || generation !== chatCacheGeneration()) return;
		loaded.current = { key, blob: content };
		if (mounted.current) setBlob(content);
		return content;
	}, [key]);
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
