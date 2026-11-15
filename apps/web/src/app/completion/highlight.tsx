import type { CompletionBinding } from "./bindings.ts";

/** Plain React text keeps user content inert; only confirmed, still-present skill ranges get color. */
export function SkillHighlight({ text, bindings }: { text: string; bindings: readonly CompletionBinding[] }) {
	const ranges = bindings
		.filter((binding) => binding.kind === "skill" && text.slice(binding.start, binding.end) === binding.marker)
		.toSorted((a, b) => a.start - b.start);
	let end = 0;
	return (
		<>
			{ranges.map((binding) => {
				const preceding = text.slice(end, binding.start);
				end = binding.end;
				return (
					<span key={binding.key}>
						{preceding}
						<span className="composer-skill-mark">{binding.marker}</span>
					</span>
				);
			})}
			{text.slice(end)}
			{"\n"}
		</>
	);
}
