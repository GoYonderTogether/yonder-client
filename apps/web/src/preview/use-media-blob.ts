import {
	chatCacheGeneration,
	loadMedia,
	type MediaDownload,
	type MediaResource,
	type MediaVariant,
	onMediaInvalidated,
	usePerson,
} from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";

type MediaLoader = MediaDownload & {
	resource: MediaResource;
	variant: MediaVariant;
	persistent?: boolean;
};

export function useMediaBlob(source: MediaLoader | undefined) {
	const owner = usePerson()?.id;
	const current = useRef({ owner, source });
	current.current = { owner, source };
	const mounted = useRef(false);
	const revision = useRef(0);
	const [invalidations, refreshSource] = useState(0);
	const loaded = useRef<{ source: MediaLoader; generation: number; owner: string; blob: Blob } | undefined>(undefined);
	const [state, setState] = useState<{
		source?: MediaLoader;
		owner?: string;
		loading?: boolean;
		error?: boolean;
		cacheError?: boolean;
	}>({});
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	useEffect(() => {
		loaded.current = undefined;
		if (!owner || !source) return;
		return onMediaInvalidated(
			owner,
			source.resource,
			source.variant,
			() => {
				loaded.current = undefined;
				revision.current++;
				setState({});
				refreshSource(revision.current);
			},
			source.persistent,
		);
	}, [owner, source]);
	const read = useCallback(
		async (cachedOnly: boolean) => {
			if (!owner || !source) return;
			const generation = chatCacheGeneration();
			const started = invalidations;
			const valid = () =>
				current.current.owner === owner &&
				current.current.source === source &&
				started === revision.current &&
				generation === chatCacheGeneration();
			const previous = loaded.current;
			if (previous?.source === source && previous.owner === owner && previous.generation === generation) {
				return previous.blob;
			}
			if (mounted.current && !cachedOnly) setState({ owner, source, loading: true });
			try {
				const result = await loadMedia(
					owner,
					source.resource,
					source.variant,
					cachedOnly ? undefined : source,
					source.persistent,
				);
				if (!result || !valid()) return;
				if (mounted.current) {
					loaded.current = { source, generation, owner, blob: result.blob };
					setState({ owner, source, cacheError: result.cacheError === true });
				}
				return result.blob;
			} catch {
				if (mounted.current && !cachedOnly && valid()) setState({ owner, source, error: true });
			}
		},
		[owner, source, invalidations],
	);
	const visible = source && state.source === source && state.owner === owner ? state : undefined;
	const media = loaded.current;
	return {
		load: useCallback(() => read(false), [read]),
		loadCached: useCallback(() => read(true), [read]),
		blob:
			visible && media?.source === source && media?.owner === owner && media?.generation === chatCacheGeneration()
				? media.blob
				: undefined,
		loading: visible?.loading === true,
		error: visible?.error === true,
		cacheError: visible?.cacheError === true,
	};
}

export function useAttachmentRevoked(id: string | undefined) {
	const owner = usePerson()?.id;
	const [revoked, setRevoked] = useState<{ id: string; owner: string }>();
	useEffect(() => {
		if (!id || !owner) return;
		return onMediaInvalidated(owner, { attachmentId: id }, "original", () => setRevoked({ id, owner }));
	}, [id, owner]);
	return !!revoked && revoked.id === id && revoked.owner === owner;
}
