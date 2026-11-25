export interface CompletionToken {
	text: string;
	start: number;
	end: number;
	prefix: "/" | "@";
	query: string;
}

/** Both entry characters use the same whitespace-delimited token grammar. */
export function completionToken(text: string, start: number, end = start): CompletionToken | null {
	if (start !== end) return null;
	const match = /(?:^|\s)([/@])([\p{L}\p{N}_-]*)$/u.exec(text.slice(0, start));
	if (!match) return null;
	const suffix = /^[\p{L}\p{N}_-]*/u.exec(text.slice(start))?.[0] ?? "";
	const tokenEnd = start + suffix.length;
	if (tokenEnd < text.length && !/\s/u.test(text[tokenEnd] ?? "")) return null;
	return {
		text,
		start: start - (match[2]?.length ?? 0) - 1,
		end: tokenEnd,
		prefix: match[1] as "/" | "@",
		query: match[2] ?? "",
	};
}

export interface CompletionItem {
	id: string;
	kind: "skill" | "member" | "command";
	name: string;
	displayNameZh?: string | undefined;
	/** A skill's wording or a command's purpose; a member row has none to show. */
	description?: string;
	source?: "platform" | "user";
	memberKind?: "person" | "bot";
	avatarUrl?: string | null;
	/** A person's public handle: searchable, shown only when display names collide. */
	handle?: string;
	showHandle?: boolean;
	/** This member row came from a keyboard-driven flow, so the list keeps its key hint. */
	keyboardHint?: boolean;
}

export const COMPLETION_PAGE_SIZE = 4;

function searchable(item: CompletionItem): string {
	return [item.name, item.displayNameZh, item.description, item.handle].filter(Boolean).join(" ").toLocaleLowerCase();
}

/**
 * A mention list keeps its order while someone types. Prefix matches move ahead of matches further
 * in the name, and inside each tier the list's own order (recent speakers first) stands: rank by how
 * well a candidate matched and the list reshuffles on every keystroke, which loses the row the eye
 * was on. Skills and commands keep their existing single-tier filter.
 */
export function filterCompletions(items: readonly CompletionItem[], query: string, prefix: "/" | "@") {
	const term = query.toLocaleLowerCase();
	const matches = items
		.filter(
			(item) => (prefix === "@" ? item.kind === "member" : item.kind !== "member") && searchable(item).includes(term),
		)
		.map((item, index) => ({ item, index }));
	if (prefix !== "@") return matches.map(({ item }) => item);
	const tier = ({ item }: { item: CompletionItem }) =>
		[item.name, item.handle].some((value) => value?.trim().toLocaleLowerCase().startsWith(term)) ? 0 : 1;
	return matches
		.sort((first, second) => tier(first) - tier(second) || first.index - second.index)
		.map(({ item }) => item);
}

/** Return null at a boundary so native caret movement is preserved. */
export function navigateCompletion(key: string, index: number, count: number): number | null {
	if (!count) return null;
	if (key === "ArrowDown") return (index + 1) % count;
	if (key === "ArrowUp") return (index + count - 1) % count;
	const direction = key === "ArrowRight" || key === "PageDown" ? 1 : key === "ArrowLeft" || key === "PageUp" ? -1 : 0;
	const page = Math.floor(index / COMPLETION_PAGE_SIZE);
	const nextPage = page + direction;
	if (!direction || nextPage < 0 || nextPage * COMPLETION_PAGE_SIZE >= count) return null;
	return Math.min(nextPage * COMPLETION_PAGE_SIZE + (index % COMPLETION_PAGE_SIZE), count - 1);
}
