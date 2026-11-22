const MAX_BATCH = 64 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024;
const DONE = "data: [DONE]\n\n";
const utf8 = new TextEncoder();

export interface DeviceModelBatch {
	seq: number;
	data: string;
	done: boolean;
	error?: string;
}

/** Sequential ack: a network failure is never retried as an ambiguous duplicate frame. */
export function deviceModelStream(post: (batch: DeviceModelBatch) => Promise<void>, onSendFailure: () => void) {
	const waiting: { data: string; size: number }[] = [];
	let timer: ReturnType<typeof setTimeout> | undefined;
	let writing: Promise<void> | undefined;
	let total = utf8.encode(DONE).length;
	let seq = 0;
	let stopped = false;
	let ending = false;

	function stop() {
		stopped = true;
		waiting.length = 0;
		clearTimeout(timer);
	}

	async function drain() {
		while (!stopped && waiting.length) {
			let data = "";
			let size = 0;
			while (waiting[0] && size + waiting[0].size <= MAX_BATCH) {
				const chunk = waiting.shift();
				if (!chunk) break;
				data += chunk.data;
				size += chunk.size;
			}
			await post({ seq, data, done: false });
			seq++;
		}
	}

	async function flush() {
		clearTimeout(timer);
		timer = undefined;
		do {
			writing ??= drain()
				.catch(() => {
					stop();
					onSendFailure();
				})
				.finally(() => {
					writing = undefined;
				});
			await writing;
		} while (!stopped && waiting.length);
	}

	return {
		push(data: string) {
			if (stopped || ending) return;
			const size = utf8.encode(data).length;
			total += size;
			if (!size || size > MAX_BATCH || total > MAX_TOTAL) {
				stop();
				onSendFailure();
				return;
			}
			waiting.push({ data, size });
			if (!timer && !writing) timer = setTimeout(() => void flush(), seq === 0 ? 0 : 32);
		},
		async finish(error?: string) {
			if (stopped || ending) return;
			ending = true;
			await flush();
			if (stopped) return;
			try {
				await post({ seq, data: error ? "" : DONE, done: true, ...(error ? { error } : {}) });
			} catch {
				onSendFailure();
			} finally {
				stop();
			}
		},
		stop,
		hasStreamed: () => seq > 0 || !!writing,
	};
}
