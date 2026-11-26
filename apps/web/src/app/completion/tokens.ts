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
	description: string;
	source?: "platform" | "user";
	memberKind?: "person" | "bot";
	avatarUrl?: string | null;
}

export const COMPLETION_PAGE_SIZE = 4;

export function filterCompletions(items: readonly CompletionItem[], query: string, prefix: "/" | "@") {
	const term = query.toLocaleLowerCase();
	return items.filter(
		(item) =>
			(prefix === "@" ? item.kind === "member" : item.kind !== "member") &&
			`${item.name} ${item.displayNameZh ?? ""} ${item.description}`.toLocaleLowerCase().includes(term),
	);
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
