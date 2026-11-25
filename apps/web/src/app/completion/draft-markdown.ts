import { flanking, processEmphasis, processStrike, type Run } from "./emphasis.ts";

export interface DraftMark {
	start: number;
	end: number;
	className: string;
}

/**
 * Mark the parts of a draft that the sent bubble would render as Markdown, without parsing the
 * editable source or changing a single character. The bubble's renderer (`markdown-to-jsx`) is the
 * source of truth: a fragment is only decorated here when that renderer would turn it into a
 * format, and `draft-markdown.test.ts` cross-checks every construct against the real parser.
 *
 * Style is paint-only. Bold, italic and larger headings would change each glyph's advance and push
 * the overlay out of character-by-character alignment with the textarea, so emphasis is carried by
 * colour, background and underline instead (see composer.css). The kinds map one-to-one onto the
 * elements the bubble renders:
 *
 *   syntax  → the marker characters themselves (`**`, `_`, `` ` ``, `#`, `>`, list markers, `[]()`)
 *   strong  → <strong>
 *   em      → <em>
 *   code    → <code> (inline)
 *   link    → <a> link text
 *   strike  → <del>
 *   heading → <h1..h6> line text
 */
export function draftMarkdownMarks(text: string): DraftMark[] {
	if (!text) return [];
	const lines = text.split("\n");
	const fences = fenceLines(lines);
	const marks: DraftMark[] = [];
	let offset = 0;
	const add = (start: number, end: number, kind: string) => {
		if (end > start) marks.push({ start, end, className: `composer-draft-${kind}` });
	};
	for (let index = 0; index < lines.length; index += 1) {
		const raw = lines[index] ?? "";
		const lineStart = offset;
		offset += raw.length + 1;
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		const push = (start: number, end: number, kind: string) => add(lineStart + start, lineStart + end, kind);

		const fence = fences[index];
		if (fence === "open" || fence === "close") {
			push(0, line.length, "syntax");
			continue;
		}
		if (fence === "body" || fence === "unclosed") continue;
		if (isThematicBreak(line)) {
			push(0, line.length, "syntax");
			continue;
		}

		let contentStart = 0;
		let headingStart: number | null = null;
		const quote = /^ {0,3}(?:(?:>[ \t]?)+)/.exec(line);
		if (quote) {
			contentStart = quote[0].length;
			push(0, contentStart, "syntax");
		} else {
			const atx = /^( {0,3})(#{1,6})(?=[ \t]|$)(.*)$/.exec(line);
			const list = atx ? null : /^( {0,3})([-+*]|\d{1,9}[.)])(?=[ \t]|$)/.exec(line);
			const marker = atx ?? list;
			if (marker) {
				const markerStart = (marker[1] ?? "").length;
				const markerEnd = markerStart + (marker[2] ?? "").length;
				push(markerStart, markerEnd, "syntax");
				contentStart = skipSpaces(line, markerEnd);
				if (atx) headingStart = contentStart;
			}
		}

		inlineMarks(line.slice(contentStart), contentStart, push);
		if (headingStart !== null) push(headingStart, line.length, "heading");
	}
	marks.sort((a, b) => a.start - b.start || a.end - b.end);
	return marks;
}

/**
 * Decorate one line's inline content (no newline). Code spans and links are recognised first because
 * they capture their own characters; emphasis then runs over the text between them.
 */
function inlineMarks(source: string, base: number, add: (start: number, end: number, kind: string) => void): void {
	const emit = (start: number, end: number, kind: string) => add(base + start, base + end, kind);
	const runs: Run[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index] ?? "";
		if (char === "\\") {
			index += 2;
			continue;
		}
		if (char === "`") {
			const length = runLength(source, index);
			const close = findRun(source, index + length, length);
			if (close === -1) {
				index += length;
				continue;
			}
			emit(index, index + length, "syntax");
			emit(index + length, close, "code");
			emit(close, close + length, "syntax");
			index = close + length;
			continue;
		}
		if (char === "[") {
			const link = /^\[([^\]\r\n]*)\]\(([^)\r\n]*)\)/.exec(source.slice(index));
			if (link) {
				const textStart = index + 1;
				const textEnd = textStart + (link[1] ?? "").length;
				const end = index + link[0].length;
				emit(index, textStart, "syntax");
				emit(textEnd, textEnd + 1, "syntax");
				emit(textEnd + 1, textEnd + 2, "syntax");
				emit(textEnd + 2, end - 1, "syntax");
				emit(end - 1, end, "syntax");
				emit(textStart, textEnd, "link");
				inlineMarks(source.slice(textStart, textEnd), base + textStart, add);
				index = end;
				continue;
			}
		}
		if (char === "<") {
			const auto = /^<(https?:\/\/[^>\s]+)>/.exec(source.slice(index));
			if (auto) {
				emit(index, index + 1, "syntax");
				emit(index + 1, index + auto[0].length - 1, "link");
				emit(index + auto[0].length - 1, index + auto[0].length, "syntax");
				index += auto[0].length;
				continue;
			}
		}
		if (char === "h" || char === "H") {
			const url = /^https?:\/\/[^\s]+/.exec(source.slice(index));
			if (url) {
				const target = trimAutoLink(url[0]);
				const after = source[index + target.length] ?? "";
				// The renderer drops the whole autolink when a URL run touches `_`/`__` (word emphasis
				// may not split a bare URL), so leave that case plain here too.
				if (target.length > "https://".length && !(after === "_" && source[index + target.length + 1] === "_")) {
					emit(index, index + target.length, "link");
					index += target.length;
					continue;
				}
			}
		}
		if (char === "*" || char === "_" || char === "~") {
			const length = runLength(source, index);
			if (char === "~" ? length === 2 : length <= 3) {
				const { canOpen, canClose } = flanking(source, index, length, char);
				runs.push({ char, start: index, length, openUsed: 0, closeUsed: 0, canOpen, canClose, done: false });
			}
			index += length;
			continue;
		}
		index += 1;
	}

	processEmphasis(runs, emit, "*");
	processEmphasis(runs, emit, "_");
	processStrike(runs, emit);
}

/** Classify every physical line of a document as a fence delimiter, fence body, or unclosed run. */
function fenceLines(lines: readonly string[]): (string | undefined)[] {
	const kinds: (string | undefined)[] = new Array(lines.length);
	let open: { char: string; length: number; from: number } | null = null;
	for (let index = 0; index < lines.length; index += 1) {
		const line = (lines[index] ?? "").replace(/\r$/, "");
		if (open) {
			const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (close && close[1]?.[0] === open.char && (close[1]?.length ?? 0) >= open.length) {
				kinds[index] = "close";
				open = null;
			} else {
				kinds[index] = "body";
			}
			continue;
		}
		const start = /^( {0,3})(`{3,}|~{3,})/.exec(line);
		if (start?.[2]) {
			open = { char: start[2][0] ?? "`", length: start[2].length, from: index };
			kinds[index] = "open";
		}
	}
	if (open) {
		// A fence that never closes is not a format yet: leave the whole run undecorated so half-typed
		// backticks do not flash grey while the author is still writing the block.
		for (let index = open.from; index < lines.length; index += 1) kinds[index] = "unclosed";
	}
	return kinds;
}

function isThematicBreak(line: string): boolean {
	return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
}

function findRun(source: string, from: number, length: number): number {
	let cursor = from;
	while (cursor < source.length) {
		if (source[cursor] === "`") {
			const run = runLength(source, cursor);
			if (run === length) return cursor;
			cursor += run;
			continue;
		}
		cursor += 1;
	}
	return -1;
}

function runLength(source: string, start: number): number {
	const char = source[start];
	let length = 0;
	while (source[start + length] === char) length += 1;
	return length;
}

function skipSpaces(line: string, from: number): number {
	let index = from;
	while (index < line.length && (line[index] === " " || line[index] === "\t")) index += 1;
	return index;
}

/** Drop the sentence punctuation the autolinker leaves outside a bare URL. */
function trimAutoLink(url: string): string {
	let end = url.length;
	while (end > 0) {
		const char = url[end - 1] ?? "";
		if (".;,!:?_~*".includes(char) || (char === ")" && !url.slice(0, end).includes("("))) {
			end -= 1;
			continue;
		}
		break;
	}
	return url.slice(0, end);
}
