import type { CompletionBinding } from "./bindings.ts";

interface Snapshot {
	text: string;
	bindings?: CompletionBinding[];
}

/** Native textarea history may group typed characters; match the actual restored text in that direction. */
export function completionHistory() {
	let scope = "";
	let entries: Snapshot[] = [];
	let index = -1;
	return (key: string, before: Snapshot, after: Snapshot, inputType?: string): CompletionBinding[] | undefined => {
		if (scope !== key) {
			scope = key;
			entries = [before];
			index = 0;
		}
		const direction = inputType === "historyUndo" ? -1 : inputType === "historyRedo" ? 1 : 0;
		if (direction) {
			for (let next = index + direction; next >= 0 && next < entries.length; next += direction) {
				if (entries[next]?.text === after.text) {
					index = next;
					return entries[next]?.bindings ?? [];
				}
			}
			entries = [after];
			index = 0;
		} else if (before.text !== after.text || before.bindings !== after.bindings) {
			entries = [...entries.slice(0, index + 1), after];
			// Native history beyond these local 100 transactions safely restores text without identities.
			if (entries.length > 100) entries.shift();
			index = entries.length - 1;
		}
		return undefined;
	};
}
