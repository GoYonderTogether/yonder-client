export interface DraftMark {
	start: number;
	end: number;
	className: string;
}

/** Decorate a few Markdown patterns without parsing or changing the editable source. */
export function draftMarkdownMarks(text: string): DraftMark[] {
	const marks: DraftMark[] = [];
	let offset = 0;
	let fence = "";
	const append = (start: number, end: number, kind: "syntax" | "heading" | "strong") => {
		marks.push({ start: offset + start, end: offset + end, className: `composer-draft-${kind}` });
	};

	for (const line of text.split("\n")) {
		const fenceMarker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (fenceMarker) {
			if (!fence) fence = fenceMarker;
			else if (fenceMarker[0] === fence[0] && fenceMarker.length >= fence.length) fence = "";
		} else if (!fence) {
			const prefix = /^([ \t]*)(#{1,6}|[-+*]|\d{1,9}[.)])([ \t]+)\S/.exec(line);
			if (prefix) {
				const [, indent = "", marker = "", separator = ""] = prefix;
				append(indent.length, indent.length + marker.length, "syntax");
				if (marker.startsWith("#")) append(indent.length + marker.length + separator.length, line.length, "heading");
			}
			for (const match of line.matchAll(/`[^`\r\n]*`|\*\*[^*\r\n]+\*\*|__[^_\r\n]+__/g)) {
				const start = match.index;
				if (match[0].startsWith("`") || line[start - 1] === "\\") continue;
				append(start, start + 2, "syntax");
				append(start + 2, start + match[0].length - 2, "strong");
				append(start + match[0].length - 2, start + match[0].length, "syntax");
			}
		}
		offset += line.length + 1;
	}
	return marks;
}
