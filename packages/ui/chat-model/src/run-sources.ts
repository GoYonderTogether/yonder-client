import type { Run } from "@yonder/protocol";

type Source = NonNullable<NonNullable<Run["activity"]>[number]["sources"]>[number];

/** Sources belong to this message's run; tool labels are not presentation content. */
export function runSources(run: Run | null | undefined): Source[] {
	const sources = new Map<string, Source>();
	for (const item of run?.activity ?? []) {
		for (const source of item.sources ?? []) {
			// Keep this protocol gate independent of DOM globals: mini-programs may not expose URL.
			if (!/^https?:\/\/[^\s/\\?#]+(?:[/?#][^\s\\]*)?$/i.test(source.url)) continue;
			const key = JSON.stringify([source.url, source.title, source.site]);
			if (!sources.has(key)) sources.set(key, source);
		}
	}
	return [...sources.values()];
}
