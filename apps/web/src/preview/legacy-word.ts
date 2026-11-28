type WordPreview = { text: string; truncated: boolean };

export async function readLegacyWord(blob: Blob, signal: AbortSignal): Promise<WordPreview> {
	signal.throwIfAborted();
	const worker = new Worker(new URL("./legacy-word.worker.ts", import.meta.url), { type: "module" });
	const failure = () => new Error("word_preview_failed");
	let timer: ReturnType<typeof setTimeout> | undefined;
	let abort: (() => void) | undefined;
	try {
		return await new Promise<WordPreview>((resolve, reject) => {
			timer = setTimeout(() => reject(failure()), 5_000);
			abort = () => reject(signal.reason);
			signal.addEventListener("abort", abort, { once: true });
			worker.onmessage = ({ data }: MessageEvent<WordPreview | null>) => (data ? resolve(data) : reject(failure()));
			worker.onerror = worker.onmessageerror = () => reject(failure());
			worker.postMessage(blob);
		});
	} finally {
		clearTimeout(timer);
		if (abort) signal.removeEventListener("abort", abort);
		worker.terminate();
	}
}
