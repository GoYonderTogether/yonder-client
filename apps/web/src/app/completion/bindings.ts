export interface CompletionMarker {
	id: string;
	kind: "skill" | "member";
	marker: string;
	start: number;
	end: number;
}

export interface CompletionBinding extends CompletionMarker {
	key: string;
}

export interface TextEditRange {
	start: number;
	end: number;
	inputType?: string;
}

export function textareaEditRange(
	before: string,
	after: string,
	selection: TextEditRange,
	inputType: string,
): TextEditRange | undefined {
	if (inputType === "historyUndo" || inputType === "historyRedo") return { start: 0, end: before.length, inputType };
	if (!/^(insert|delete)/u.test(inputType)) return undefined;
	if (selection.start !== selection.end) return selection;
	const removed = before.length - after.length;
	if (removed <= 0) return selection;
	if (inputType.endsWith("Backward")) return { start: selection.start - removed, end: selection.end };
	if (inputType.endsWith("Forward")) return { start: selection.start, end: selection.end + removed };
	return undefined;
}

function present(text: string, binding: CompletionMarker): boolean {
	return (
		text.slice(binding.start, binding.end) === binding.marker &&
		(binding.start === 0 || /\s/u.test(text[binding.start - 1] ?? "")) &&
		(binding.end === text.length || /\s/u.test(text[binding.end] ?? ""))
	);
}

/** Move confirmed ranges through an edit; never infer a binding from raw marker text. */
export function reconcileBindings(
	before: string,
	after: string,
	bindings: readonly CompletionBinding[],
	edit?: TextEditRange,
): CompletionBinding[] {
	const delta = after.length - before.length;
	const newEnd = (edit?.end ?? 0) + delta;
	const certain =
		edit &&
		edit.start >= 0 &&
		edit.end >= edit.start &&
		edit.end <= before.length &&
		newEnd >= edit.start &&
		before.slice(0, edit.start) === after.slice(0, edit.start) &&
		before.slice(edit.end) === after.slice(newEnd);
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) start++;
	let suffix = 0;
	while (
		suffix < Math.min(before.length, after.length) &&
		before[before.length - suffix - 1] === after[after.length - suffix - 1]
	)
		suffix++;
	let oldEnd = before.length - Math.min(suffix, Math.min(before.length, after.length) - start);
	if (certain) {
		start = edit.start;
		oldEnd = edit.end;
	} else if (before !== after) {
		// Unknown programmatic edits invalidate the whole ambiguous interval instead of guessing an identity.
		start = Math.min(start, before.length - suffix, after.length - suffix);
	}
	return bindings.flatMap((binding) => {
		const next =
			binding.end <= start
				? binding
				: binding.start >= oldEnd
					? { ...binding, start: binding.start + delta, end: binding.end + delta }
					: null;
		return next && present(after, next) ? [next] : [];
	});
}

export function boundSkillIds(text: string, bindings: readonly CompletionBinding[]): string[] {
	return [
		...new Set(
			bindings.filter((binding) => binding.kind === "skill" && present(text, binding)).map((binding) => binding.id),
		),
	];
}

export function boundMemberIds(text: string, bindings: readonly CompletionBinding[]): string[] {
	return [
		...new Set(
			bindings
				.filter((binding) => binding.kind === "member" && present(text, binding))
				.sort((first, second) => first.start - second.start)
				.map((binding) => binding.id),
		),
	];
}
