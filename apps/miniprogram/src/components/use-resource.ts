import { useDidShow } from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../lib/runtime";
import { errorText } from "./ui";

/** Reload on return from a child page; discard stale responses after unmount. */
export function useResource<T>(load: () => Promise<T>) {
	const { status } = useSession();
	const shown = useRef(false);
	const loader = useRef(load);
	loader.current = load;
	const active = useRef(true);
	const generation = useRef(0);
	const [data, setData] = useState<T>();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const reload = useCallback(async () => {
		const version = ++generation.current;
		setLoading(true);
		setError("");
		try {
			const value = await loader.current();
			if (active.current && version === generation.current) setData(value);
		} catch (cause) {
			if (active.current && version === generation.current) setError(errorText(cause));
		} finally {
			if (active.current && version === generation.current) setLoading(false);
		}
	}, []);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	useEffect(() => {
		if (status === "signed-in") void reload();
		else {
			generation.current++;
			setData(undefined);
			setLoading(status === "booting");
			setError("");
		}
	}, [status, reload]);
	useDidShow(() => {
		if (shown.current && status === "signed-in") void reload();
		shown.current = true;
	});
	return { data, loading, error, reload };
}
