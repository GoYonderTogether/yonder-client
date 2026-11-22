import { type CompletionBinding, isBindingPresent } from "./bindings.ts";
import type { DraftMark } from "./draft-markdown.ts";
import type { CompletionToken } from "./tokens.ts";

export function CompletionHighlight({
	text,
	bindings,
	token,
	markdown = [],
}: {
	text: string;
	bindings: readonly CompletionBinding[];
	token: CompletionToken | null;
	markdown?: readonly DraftMark[];
}) {
	const completionClass = "composer-completion-mark";
	const ranges: DraftMark[] = bindings
		.filter((binding) => isBindingPresent(text, binding))
		.map(({ start, end }) => ({ start, end, className: completionClass }));
	if (token && !ranges.some((range) => token.start < range.end && token.end > range.start)) {
		ranges.push({ start: token.start, end: token.end, className: completionClass });
	}
	// Boundaries let a mention keep its coloring even when it appears inside a Markdown span.
	const edges = [...ranges, ...markdown]
		.flatMap(({ start, end, className }) => [
			{ index: start, className, delta: 1 },
			{ index: end, className, delta: -1 },
		])
		.sort((a, b) => a.index - b.index);
	const active = new Map<string, number>();
	const spans = [];
	let from = 0;
	for (const { index, className, delta } of edges) {
		if (index > from) {
			spans.push(
				<span key={from} className={[...active.keys()].join(" ") || undefined}>
					{text.slice(from, index)}
				</span>,
			);
			from = index;
		}
		const count = (active.get(className) ?? 0) + delta;
		if (count) active.set(className, count);
		else active.delete(className);
	}
	return (
		<>
			{spans}
			{text.slice(from)}
			{"\n"}
		</>
	);
}
