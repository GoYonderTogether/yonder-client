/** Only the abort surface used by miniFetch; WeChat does not promise a browser AbortController. */
export function uploadCancellation() {
	let aborted = false;
	const listeners = new Set<() => void>();
	const signal = {
		get aborted() {
			return aborted;
		},
		addEventListener(type: string, listener: () => void) {
			if (type === "abort") listeners.add(listener);
		},
		removeEventListener(type: string, listener: () => void) {
			if (type === "abort") listeners.delete(listener);
		},
	} as unknown as AbortSignal;
	return {
		signal,
		abort() {
			if (aborted) return;
			aborted = true;
			for (const listener of listeners) listener();
			listeners.clear();
		},
	};
}
