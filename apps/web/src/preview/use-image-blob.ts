import {
	chatCacheGeneration,
	type ImageResource,
	type ImageVariant,
	loadImage,
	onImageInvalidated,
	usePerson,
} from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";

type ImageLoader = {
	resource: ImageResource;
	variant: ImageVariant;
	sign: () => Promise<{ url: string | null }>;
	local: () => Promise<Blob>;
	persistent?: boolean;
};

export function useImageBlob(source: ImageLoader | undefined) {
	const owner = usePerson()?.id;
	const current = useRef(source);
	current.current = source;
	const mounted = useRef(false);
	const revision = useRef(0);
	const [invalidations, refreshSource] = useState(0);
	const loaded = useRef<{ source: ImageLoader; generation: number; blob: Blob } | undefined>(undefined);
	const [state, setState] = useState<{
		source?: ImageLoader;
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
		return onImageInvalidated(
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
	const load = useCallback(async () => {
		if (!owner || !source) return;
		const generation = chatCacheGeneration();
		const started = invalidations;
		const valid = () =>
			current.current === source && started === revision.current && generation === chatCacheGeneration();
		const previous = loaded.current;
		if (previous?.source === source && previous.generation === generation) return previous.blob;
		if (mounted.current) setState({ source, loading: true });
		try {
			const result = await loadImage(
				owner,
				source.resource,
				source.variant,
				source.sign,
				source.local,
				source.persistent,
			);
			if (!result || !valid()) return;
			if (mounted.current) {
				loaded.current = { source, generation, blob: result.blob };
				setState({ source, cacheError: result.cacheError === true });
			}
			return result.blob;
		} catch {
			if (mounted.current && valid()) setState({ source, error: true });
		}
	}, [owner, source, invalidations]);
	const visible = source && state.source === source ? state : undefined;
	const image = loaded.current;
	return {
		load,
		blob:
			visible && image && image.source === source && image.generation === chatCacheGeneration()
				? image.blob
				: undefined,
		loading: visible?.loading === true,
		error: visible?.error === true,
		cacheError: visible?.cacheError === true,
	};
}

export function useAttachmentImageRevoked(id: string | undefined) {
	const owner = usePerson()?.id;
	const [revoked, setRevoked] = useState<string>();
	useEffect(() => {
		if (!id || !owner) return;
		return onImageInvalidated(owner, { attachmentId: id }, "original", () => setRevoked(id));
	}, [id, owner]);
	return !!id && revoked === id;
}
