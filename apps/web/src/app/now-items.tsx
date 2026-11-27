import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { NowItem } from "./now-strip.tsx";

/**
 * Where the present is collected. Any page (the timeline, the task and list pages) publishes the
 * items it has under its own source name; the composer's status slot reads them all. Nothing here
 * knows what a task or a list is, so a new page adds to the present without touching the timeline
 * or the composer. A source's items are replaced as a whole and dropped when the page unmounts.
 */
interface NowFeed {
	items: readonly NowItem[];
	set: (source: string, items: readonly NowItem[]) => void;
}

const NowContext = createContext<NowFeed | null>(null);

/** Running tasks come first: they are what is happening, the waiting ones are what is on the owner. */
const byKind = (a: NowItem, b: NowItem) => Number(b.kind === "running") - Number(a.kind === "running");

export function NowProvider({ children }: { children: ReactNode }) {
	const [sources, setSources] = useState<Record<string, readonly NowItem[]>>({});
	const set = useCallback((source: string, items: readonly NowItem[]) => {
		setSources((current) => {
			if (!items.length) {
				if (!(source in current)) return current;
				const { [source]: _dropped, ...rest } = current;
				return rest;
			}
			return { ...current, [source]: items };
		});
	}, []);
	const value = useMemo<NowFeed>(
		() => ({ items: Object.values(sources).flat().toSorted(byKind), set }),
		[sources, set],
	);
	return <NowContext.Provider value={value}>{children}</NowContext.Provider>;
}

/** What the status slot shows. Outside a provider there is nothing to show. */
export function useNowItems(): readonly NowItem[] {
	return useContext(NowContext)?.items ?? [];
}

/** Publish a page's items to the present. Pass a memoised array: a new array each render republishes. */
export function usePublishNow(source: string, items: readonly NowItem[]) {
	const set = useContext(NowContext)?.set;
	useEffect(() => {
		set?.(source, items);
		return () => set?.(source, []);
	}, [set, source, items]);
}
