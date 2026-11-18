import { type CompletionBinding, isBindingPresent } from "./bindings.ts";
import type { CompletionToken } from "./tokens.ts";

export function CompletionHighlight({
	text,
	bindings,
	token,
}: {
	text: string;
	bindings: readonly CompletionBinding[];
	token: CompletionToken | null;
}) {
	const ranges: Pick<CompletionBinding, "key" | "marker" | "start" | "end">[] = bindings.filter((binding) =>
		isBindingPresent(text, binding),
	);
	if (token && !ranges.some((range) => token.start < range.end && token.end > range.start)) {
		ranges.push({
			key: "active",
			start: token.start,
			end: token.end,
			marker: text.slice(token.start, token.end),
		});
	}
	ranges.sort((a, b) => a.start - b.start);
	let end = 0;
	return (
		<>
			{ranges.map((range) => {
				if (range.start < end) return null;
				const preceding = text.slice(end, range.start);
				end = range.end;
				return (
					<span key={range.key}>
						{preceding}
						<span className="composer-completion-mark">{range.marker}</span>
					</span>
				);
			})}
			{text.slice(end)}
			{"\n"}
		</>
	);
}
