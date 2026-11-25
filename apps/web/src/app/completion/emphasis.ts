/**
 * CommonMark's "process emphasis" and strikethrough pairing, reduced to the one thing the draft
 * overlay needs: which character ranges are marker syntax and which are the formatted content. The
 * scanner in `draft-markdown.ts` finds the delimiter runs and code/link spans; this file decides how
 * they pair up, so `**a *b* c**`, `***a***` and the like resolve exactly as the sent bubble's own
 * `markdown-to-jsx` parser resolves them.
 */

export interface Run {
	char: string;
	start: number;
	length: number;
	openUsed: number;
	closeUsed: number;
	canOpen: boolean;
	canClose: boolean;
	done: boolean;
}

export type Emit = (start: number, end: number, kind: string) => void;

/** Left/right flanking per CommonMark, computed from the characters around the delimiter run. */
export function flanking(
	source: string,
	start: number,
	length: number,
	char: string,
): { canOpen: boolean; canClose: boolean } {
	const before = source[start - 1] ?? "";
	const after = source[start + length] ?? "";
	const beforeSpace = isSpace(before);
	const afterSpace = isSpace(after);
	const beforePunct = isPunct(before);
	const afterPunct = isPunct(after);
	const leftFlanking = !afterSpace && (!afterPunct || beforeSpace || beforePunct);
	const rightFlanking = !beforeSpace && (!beforePunct || afterSpace || afterPunct);
	if (char === "_")
		return {
			canOpen: leftFlanking && (!rightFlanking || beforePunct),
			canClose: rightFlanking && (!leftFlanking || afterPunct),
		};
	return { canOpen: leftFlanking, canClose: rightFlanking };
}

/** Pair runs of one emphasis character and emit each pair's marker and content ranges. */
export function processEmphasis(runs: Run[], emit: Emit, char: string): void {
	const delimiters = runs.filter((run) => run.char === char);
	for (let closerIndex = 0; closerIndex < delimiters.length; closerIndex += 1) {
		const closer = delimiters[closerIndex];
		if (!closer || closer.done || !closer.canClose || closer.length === 0) continue;
		while (closer.length > 0) {
			let opener: Run | undefined;
			for (let back = closerIndex - 1; back >= 0; back -= 1) {
				const candidate = delimiters[back];
				if (!candidate || candidate.done || candidate.length === 0 || !candidate.canOpen) continue;
				// Rule of three: do not pair runs that both open and close when their combined length is a
				// multiple of three, which would otherwise misread `*a**b*`-style input.
				const triple =
					(closer.canOpen || candidate.canClose) &&
					closer.length % 3 !== 0 &&
					(candidate.length + closer.length) % 3 === 0;
				if (triple) continue;
				opener = candidate;
				break;
			}
			if (!opener) {
				if (!closer.canOpen) closer.done = true;
				break;
			}
			const use = opener.length >= 2 && closer.length >= 2 ? 2 : 1;
			opener.length -= use;
			opener.openUsed += use;
			closer.length -= use;
			closer.closeUsed += use;
			emit(opener.start + opener.length, opener.start + opener.length + use, "syntax");
			emit(closer.start + closer.closeUsed - use, closer.start + closer.closeUsed, "syntax");
			emit(opener.start + opener.length + use, closer.start + closer.closeUsed - use, use === 2 ? "strong" : "em");
			if (opener.length === 0) opener.done = true;
			if (closer.length === 0) closer.done = true;
		}
	}
}

/** Pair `~~` runs (GFM strikethrough) left to right. */
export function processStrike(runs: Run[], emit: Emit): void {
	let opener: Run | undefined;
	for (const run of runs) {
		if (run.char !== "~" || run.done || run.length !== 2) continue;
		if (!opener) {
			opener = run;
			continue;
		}
		emit(opener.start, opener.start + 2, "syntax");
		emit(opener.start + 2, run.start, "strike");
		emit(run.start, run.start + 2, "syntax");
		opener = undefined;
	}
}

export function isSpace(char: string): boolean {
	return char === "" || char === " " || char === "\t" || char === "\n";
}

function isPunct(char: string): boolean {
	return char !== "" && /[\p{P}\p{S}]/u.test(char);
}
