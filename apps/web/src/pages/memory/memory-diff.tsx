import { cn } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

type Line = { kind: "same" | "added" | "removed"; text: string };

/** Lines around a change kept for context; the rest of an unchanged run folds away. */
const CONTEXT = 2;

/**
 * A line diff: the shared head and tail are trimmed, the middle is compared by longest common
 * subsequence. Memory files are at most 64 KB, so the middle stays small enough to compare whole.
 */
export function diffLines(before: string, after: string): Line[] {
	const older = before.split("\n");
	const newer = after.split("\n");
	let start = 0;
	while (start < older.length && start < newer.length && older[start] === newer[start]) start++;
	let end = 0;
	while (
		end < older.length - start &&
		end < newer.length - start &&
		older[older.length - 1 - end] === newer[newer.length - 1 - end]
	)
		end++;
	const a = older.slice(start, older.length - end);
	const b = newer.slice(start, newer.length - end);
	const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			// biome-ignore lint/style/noNonNullAssertion: indices are inside the table.
			table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
	const middle: Line[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			middle.push({ kind: "same", text: a[i++] as string });
			j++;
		} else if (j < b.length && (i >= a.length || (table[i]?.[j + 1] ?? 0) >= (table[i + 1]?.[j] ?? 0))) {
			middle.push({ kind: "added", text: b[j++] as string });
		} else {
			middle.push({ kind: "removed", text: a[i++] as string });
		}
	}
	const same = (text: string): Line => ({ kind: "same", text });
	return [...older.slice(0, start).map(same), ...middle, ...newer.slice(newer.length - end).map(same)];
}

/** What changed, added lines in the success colour and removed ones in the danger colour (24 第六节). */
export function MemoryDiff({ before, after }: { before: string; after: string }) {
	const { t } = useTranslation();
	if (before === after)
		return <p className="text-caption text-[var(--color-text-tertiary)]">{t("memory.noContentChange")}</p>;
	const lines = diffLines(before, after);
	const near = lines.map((_, index) =>
		lines.slice(Math.max(0, index - CONTEXT), index + CONTEXT + 1).some((line) => line.kind !== "same"),
	);
	return (
		<pre className="overflow-x-auto rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] py-[var(--spacing-2)] text-caption whitespace-pre-wrap [overflow-wrap:anywhere]">
			{lines.map((line, index) =>
				near[index] ? (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their place.
						key={index}
						className={cn(
							"px-[var(--spacing-3)]",
							line.kind === "added" &&
								"bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]",
							line.kind === "removed" && "bg-[var(--color-danger-subtle)] text-[var(--color-danger)] line-through",
							line.kind === "same" && "text-[var(--color-text-secondary)]",
						)}
					>
						<span aria-hidden className="select-none pe-[var(--spacing-2)]">
							{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
						</span>
						{line.text || " "}
					</div>
				) : index > 0 && near[index - 1] ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: a fold marker sits between kept lines.
					<div key={index} aria-hidden className="px-[var(--spacing-3)] text-[var(--color-text-tertiary)]">
						⋯
					</div>
				) : null,
			)}
		</pre>
	);
}
