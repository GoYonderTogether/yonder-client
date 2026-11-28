const readableExtensions =
	/\.(?:txt|md|markdown|csv|tsv|json|jsonl|ndjson|log|ya?ml|ini|conf|toml|sql|xml|html?|css|[cm]?jsx?|tsx?|py|sh|srt|vtt|ass|ssa)$/i;
const readableApplicationTypes =
	/^application\/(?:json|xml|sql|toml|javascript|(?:x-)?(?:jsonl|ndjson|yaml|subrip|ass|ssa)|[\w.+-]+\+(?:json|xml))$/i;

export function isTextAttachment(name: string, mime: string): boolean {
	const type = (mime.split(";", 1)[0] ?? "").trim();
	return /^text\//i.test(type) || readableApplicationTypes.test(type) || readableExtensions.test(name);
}

/** Prefer line boundaries, keeping CRLF and Unicode code points intact even on long lines. */
export function splitTextAttachment(text: string, pageSize = 32_000): string[] {
	const pages: string[] = [];
	const size = Math.max(1, Math.trunc(pageSize) || 1);
	for (let start = 0; start < text.length; ) {
		let end = Math.min(start + size, text.length);
		if (end < text.length) {
			const earlierBreak = text.slice(start, end).lastIndexOf("\n");
			if (earlierBreak >= 0) end = start + earlierBreak + 1;
			else if ((text[end - 1] === "\r" && text[end] === "\n") || (text.codePointAt(end - 1) ?? 0) > 0xffff) {
				end += 1;
			}
		}
		pages.push(text.slice(start, end));
		start = end;
	}
	return pages;
}
