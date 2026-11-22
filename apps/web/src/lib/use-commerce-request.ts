import { useCallback, useEffect, useRef } from "react";

/** Run only from an explicit action. A returned delay schedules the next status check. */
export function useCommerceRequest() {
	const active = useRef<AbortController | null>(null);
	const cancel = useCallback(() => active.current?.abort(), []);
	useEffect(() => cancel, [cancel]);

	function run<T>(
		request: (signal: AbortSignal) => Promise<T>,
		onResult: (result: T) => number | undefined,
		onError: () => void,
	) {
		cancel();
		const controller = new AbortController();
		active.current = controller;
		const { signal } = controller;
		let timer: ReturnType<typeof setTimeout>;
		signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
		async function check() {
			try {
				const result = await request(signal);
				if (signal.aborted) return;
				const delay = onResult(result);
				if (delay !== undefined && !signal.aborted) timer = setTimeout(check, delay);
			} catch {
				if (!signal.aborted) onError();
			}
		}
		void check();
	}

	return { run, cancel };
}
