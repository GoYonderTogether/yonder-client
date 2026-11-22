const MAX_PART = 64 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024;
/** The server stops counting parts here, so a call that would need more is refused. */
const MAX_PARTS = 2048;
const utf8 = new TextEncoder();

/**
 * Ordered parts for one device-local relay call. The server accepts part `n` only after every part
 * before it and takes `nextSeq` from the end, so a part that may or may not have arrived is never
 * replayed as an ambiguous duplicate: the call fails instead.
 */
export function deviceModelStream(sendPart: (seq: number, part: string) => Promise<void>, onSendFailure: () => void) {
	const waiting: { data: string; size: number }[] = [];
	let timer: ReturnType<typeof setTimeout> | undefined;
	let writing: Promise<void> | undefined;
	let total = 0;
	let seq = 0;
	let stopped = false;
	let ending = false;

	function stop() {
		stopped = true;
		waiting.length = 0;
		clearTimeout(timer);
	}

	function fail() {
		stop();
		onSendFailure();
	}

	async function drain() {
		while (!stopped && waiting.length) {
			let data = "";
			let size = 0;
			while (waiting[0] && size + waiting[0].size <= MAX_PART) {
				const chunk = waiting.shift();
				if (!chunk) break;
				data += chunk.data;
				size += chunk.size;
			}
			await sendPart(seq, data);
			seq++;
		}
	}

	async function flush() {
		clearTimeout(timer);
		timer = undefined;
		do {
			writing ??= drain()
				.catch(fail)
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
			// A part carries whole events; splitting one would leave the server a broken frame.
			if (!size || size > MAX_PART || total + size > MAX_TOTAL || seq + 1 > MAX_PARTS) {
				fail();
				return;
			}
			total += size;
			waiting.push({ data, size });
			if (!timer && !writing) timer = setTimeout(() => void flush(), seq === 0 ? 0 : 32);
		},
		/**
		 * Send what is buffered, then `last` as the final part — the one frame the server holds back
		 * until it reads the end — and answer how many parts were sent, which is the end's `nextSeq`.
		 * `null` means the stream already failed, so nothing may claim success.
		 */
		async finish(last?: string): Promise<number | null> {
			if (stopped || ending) return null;
			ending = true;
			await flush();
			if (stopped) return null;
			if (last !== undefined) {
				const size = utf8.encode(last).length;
				if (size > MAX_PART || total + size > MAX_TOTAL || seq + 1 > MAX_PARTS) {
					fail();
					return null;
				}
				total += size;
				try {
					await sendPart(seq, last);
				} catch {
					fail();
					return null;
				}
				seq++;
			}
			stop();
			return seq;
		},
		/** How many parts reached the socket; the end must report exactly this. */
		count: () => seq,
		/** What the answer costs in bytes, for the limit that depends on the operation. */
		bytes: () => total,
		stop,
	};
}
