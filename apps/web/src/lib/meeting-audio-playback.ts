import type { MeetingSegment } from "@yonder/protocol";

export function meetingAudioTimeline(segments: readonly MeetingSegment[]) {
	let end = 0;
	return [...segments]
		.sort((a, b) => a.index - b.index)
		.map((segment) => {
			const start = end;
			end += segment.durationMs;
			return { ...segment, start, end };
		});
}

type Part = ReturnType<typeof meetingAudioTimeline>[number];
type ScheduledPart = {
	source: AudioBufferSourceNode;
	from: number;
	to: number;
	start: number;
	end: number;
	finished: Promise<void>;
};

/** Schedule the next WAV across the current part's boundary without decoding the entire recording. */
export function playMeetingAudio(
	context: AudioContext,
	timeline: readonly Part[],
	position: number,
	read: (part: Part, signal: AbortSignal) => Promise<ArrayBuffer>,
	onStart: () => void,
) {
	const controller = new AbortController();
	const { signal } = controller;
	let current: ScheduledPart | undefined;
	let next: ScheduledPart | undefined;

	async function play() {
		await context.resume();
		for (const part of timeline) {
			if (part.end <= position) continue;
			// The active part already has a successor queued. Wait before reading more audio.
			if (next) {
				await current?.finished;
				current = next;
				next = undefined;
			}
			signal.throwIfAborted();
			let buffer: AudioBuffer;
			try {
				const bytes = await read(part, signal);
				signal.throwIfAborted();
				buffer = await context.decodeAudioData(bytes);
			} catch (error) {
				// Let already scheduled audio finish if a later part is missing.
				if (!signal.aborted) await (next ?? current)?.finished;
				throw error;
			}
			signal.throwIfAborted();

			const from = Math.max(part.start, position);
			const offset = ((from - part.start) / part.durationMs) * buffer.duration;
			const start = Math.max(context.currentTime, current?.end ?? 0);
			const source = context.createBufferSource();
			source.buffer = buffer;
			source.connect(context.destination);
			const finished = new Promise<void>((resolve) => {
				const finish = () => {
					signal.removeEventListener("abort", finish);
					source.disconnect();
					resolve();
				};
				source.onended = finish;
				signal.addEventListener("abort", finish, { once: true });
			});
			source.start(start, offset);
			const scheduled = { source, from, to: part.end, start, end: start + buffer.duration - offset, finished };
			if (current) next = scheduled;
			else {
				current = scheduled;
				onStart();
			}
		}
		await (next ?? current)?.finished;
	}

	return {
		done: play(),
		position() {
			const time = context.currentTime;
			const part = next && time >= next.start ? next : current;
			if (!part) return position;
			const progress = Math.max(0, Math.min(1, (time - part.start) / (part.end - part.start)));
			return part.from + progress * (part.to - part.from);
		},
		stop() {
			controller.abort();
			current?.source.stop();
			next?.source.stop();
		},
	};
}
