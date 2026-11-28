import { useDidShow } from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";
import { METADATA_FRESH_MS, readSnapshot, updateSnapshots, writeSnapshot } from "../lib/metadata-cache";
import { useSession } from "../lib/runtime";
import { errorText } from "./ui";

/** Reload on return from a child page; discard stale responses after unmount. */
export function useResource<T>(load: () => Promise<T>, cacheKey?: string, onUpdate?: (before: T, after: T) => void) {
	const { status } = useSession();
	const shown = useRef(false);
	const loader = useRef(load);
	loader.current = load;
	const scope = useRef(cacheKey);
	scope.current = cacheKey;
	const update = useRef(onUpdate);
	update.current = onUpdate;
	const active = useRef(true);
	const generation = useRef(0);
	const [saved, setSaved] = useState<{ key: string | undefined; data: T } | undefined>(() => {
		const snapshot = cacheKey ? readSnapshot<T>(cacheKey) : undefined;
		return snapshot ? { key: cacheKey, data: snapshot.data } : undefined;
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const reload = useCallback(async () => {
		const version = ++generation.current;
		const key = scope.current;
		const current = () => active.current && version === generation.current && scope.current === key;
		setLoading(true);
		setError("");
		try {
			const value = await loader.current();
			if (current()) {
				if (key) {
					const before = readSnapshot<T>(key);
					if (before) update.current?.(before.data, value);
					writeSnapshot(key, value);
				}
				setSaved({ key, data: value });
			}
		} catch (cause) {
			if (current()) {
				if (
					key &&
					cause &&
					typeof cause === "object" &&
					"status" in cause &&
					[401, 403, 404].includes(Number(cause.status))
				) {
					updateSnapshots(key, () => undefined);
					setSaved(undefined);
				}
				setError(errorText(cause));
			}
		} finally {
			if (current()) setLoading(false);
		}
	}, []);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	useEffect(() => {
		if (status === "signed-in") {
			const snapshot = cacheKey ? readSnapshot<T>(cacheKey) : undefined;
			if (snapshot) setSaved({ key: cacheKey, data: snapshot.data });
			if (!snapshot || Date.now() - snapshot.savedAt >= METADATA_FRESH_MS) void reload();
			else setLoading(false);
		} else {
			generation.current++;
			setSaved(undefined);
			setLoading(status === "booting");
			setError("");
		}
	}, [cacheKey, status, reload]);
	useDidShow(() => {
		if (shown.current && status === "signed-in") {
			const snapshot = cacheKey ? readSnapshot<T>(cacheKey) : undefined;
			if (!snapshot || Date.now() - snapshot.savedAt >= METADATA_FRESH_MS) void reload();
		}
		shown.current = true;
	});
	return { data: saved?.key === cacheKey ? saved?.data : undefined, loading, error, reload };
}
