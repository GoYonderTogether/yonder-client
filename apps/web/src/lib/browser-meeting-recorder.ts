import { type MeetingRecorderState, type MeetingRecording, resumeDeadline } from "@yonder/feature-meetings";
import { listBrowserMeetings, readBrowserMeeting, saveBrowserMeeting } from "./browser-meeting-store.ts";
import { MEETING_PART_MS, MEETING_RATE, meetingWav } from "./browser-meeting-wav.ts";

const LOCK = "yonder-meeting-microphone";
const MAX_MS = 2 * 60 * 60 * 1000;
const MAX_PART_MS = 5000;
const MAX_PARTS = 1801;
const EMPTY_TAIL_WINDOW_MS = 250;
let owner: string | null = null;
let starting = false;
let active:
	| {
			record: MeetingRecording;
			paused: boolean;
			level(): number;
			duration(): number;
			pause(): Promise<void>;
			resume(): void;
			stop(reason?: string): Promise<void>;
	  }
	| undefined;

export function browserMeetingSupported() {
	return (
		typeof MediaRecorder !== "undefined" &&
		typeof AudioContext !== "undefined" &&
		typeof OfflineAudioContext !== "undefined" &&
		typeof navigator.mediaDevices?.getUserMedia === "function" &&
		Boolean(navigator.locks && globalThis.indexedDB)
	);
}

function requireOwner(requested: unknown): string {
	if (!owner || owner !== requested) throw "owner_mismatch";
	return owner;
}

async function state(requested: string | null): Promise<MeetingRecorderState> {
	const result: MeetingRecorderState = {
		supported: browserMeetingSupported(),
		pauseSupported: true,
		activeId: null,
		audioLevel: 0,
		recordings: [],
	};
	if (!requested) return result;
	requireOwner(requested);
	result.recordings = await listBrowserMeetings(requested);
	if (!active && !starting && result.recordings.some((record) => record.state === "recording")) {
		await navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
			if (!lock) return;
			for (const record of await listBrowserMeetings(requested)) {
				if (record.state === "recording") {
					await saveBrowserMeeting({
						...record,
						state: "interrupted",
						endedAt: record.savedAt ?? record.startedAt + record.savedDurationMs,
						error: "page_closed",
					});
				}
			}
		});
		result.recordings = await listBrowserMeetings(requested);
	}
	result.recordings.sort((a, b) => b.startedAt - a.startedAt);
	requireOwner(requested);
	if (active?.record.ownerId === requested) {
		result.activeId = active.record.id;
		result.paused = active.paused;
		result.audioLevel = active.level();
		const recording = result.recordings.find((item) => item.id === result.activeId);
		if (recording) recording.durationMs = active.duration();
	}
	result.recordings = result.recordings.filter(
		(record) => record.state !== "recording" || record.id === result.activeId,
	);
	return result;
}

async function capture(record: MeetingRecording, stream: MediaStream, context: AudioContext, release: () => void) {
	const decoder = new OfflineAudioContext(1, 1, MEETING_RATE);
	const source = context.createMediaStreamSource(stream);
	const analyser = context.createAnalyser();
	source.connect(analyser);
	const samples = new Float32Array(analyser.fftSize);
	let recorder: MediaRecorder;
	let writes = Promise.resolve();
	let timer: ReturnType<typeof setTimeout>;
	let failure: string | undefined;
	let finishing: Promise<void> | undefined;
	let partStarted = 0;
	let shortTail: MediaRecorder | undefined;
	const track = stream.getAudioTracks()[0];
	if (track?.readyState !== "live") throw "audio_unavailable";

	async function persist(chunks: Blob[]) {
		if (!chunks.length || failure === "storage_failed") return;
		const decoded = await decoder.decodeAudioData(await new Blob(chunks).arrayBuffer());
		const parts: Uint8Array<ArrayBuffer>[] = [];
		const next = { ...record, segments: [...record.segments] };
		const maxFrames = Math.min(decoded.length, ((MAX_MS - next.savedDurationMs) * MEETING_RATE) / 1000);
		for (let start = 0; start < maxFrames && next.segments.length < MAX_PARTS; ) {
			const frames = Math.min((MEETING_RATE * MAX_PART_MS) / 1000, maxFrames - start);
			const durationMs = Math.floor((frames * 1000) / MEETING_RATE);
			if (!durationMs) break;
			const bytes = meetingWav(decoded, start, frames);
			parts.push(bytes);
			next.segments.push({ index: next.segments.length, durationMs, byteLength: bytes.length });
			next.savedDurationMs += durationMs;
			start += frames;
		}
		next.durationMs = next.savedDurationMs;
		next.savedAt = Date.now();
		if (parts.length) {
			await saveBrowserMeeting(next, parts);
			Object.assign(record, next);
		}
		if (next.segments.length >= MAX_PARTS || next.savedDurationMs >= MAX_MS) void stop().catch(() => {});
	}

	function interrupt(reason: string) {
		void stop(reason).catch(() => {});
	}
	const ended = () => interrupt("audio_interrupted");
	const pageHidden = () => interrupt("page_closed");
	const suspended = () => interrupt("page_suspended");

	function closePart(part: MediaRecorder, userAction = false) {
		if (part.state === "inactive") return;
		if (userAction && performance.now() - partStarted < EMPTY_TAIL_WINDOW_MS) shortTail = part;
		part.stop();
	}

	function openPart() {
		// Each stopped recorder produces a complete container. Timeslice blobs from one
		// continuous MediaRecorder cannot in general be decoded independently.
		const part = new MediaRecorder(stream);
		const chunks: Blob[] = [];
		let completed: () => void;
		const stopped = new Promise<void>((resolve) => {
			completed = resolve;
		});
		part.ondataavailable = (event) => {
			if (event.data.size) chunks.push(event.data);
		};
		part.onstop = () => {
			completed();
			if (part === recorder && !finishing && !active?.paused) ended();
		};
		part.onerror = ended;
		part.start();
		recorder = part;
		partStarted = performance.now();
		writes = writes
			.then(() => stopped)
			.then(() => persist(chunks))
			.catch((cause) => {
				// Immediately after a rollover, Chromium can stop before the new container holds any samples.
				if (
					part === shortTail &&
					record.segments.length &&
					cause instanceof DOMException &&
					cause.name === "EncodingError"
				)
					return;
				failure = cause === "storage_failed" ? "storage_failed" : "audio_interrupted";
				interrupt(failure);
			});
		timer = setTimeout(() => {
			if (performance.now() - partStarted > MEETING_PART_MS + 5000) {
				suspended();
				return;
			}
			try {
				closePart(part);
				openPart();
			} catch {
				ended();
			}
		}, MEETING_PART_MS);
	}

	function stop(reason?: string) {
		if (finishing) return finishing;
		const endedAt = Math.max(record.startedAt, Date.now());
		clearTimeout(timer);
		document.removeEventListener("freeze", suspended);
		window.removeEventListener("pagehide", pageHidden);
		track?.removeEventListener("ended", ended);
		track?.removeEventListener("mute", ended);
		closePart(recorder, !reason);
		for (const item of stream.getTracks()) item.stop();
		void context.close().catch(() => {});
		finishing = writes
			.then(() =>
				saveBrowserMeeting({
					...record,
					state: reason || failure || !record.segments.length ? "interrupted" : "ended",
					endedAt,
					error: failure ?? reason ?? (record.segments.length ? null : "audio_unavailable"),
				}),
			)
			.finally(() => {
				active = undefined;
				release();
			});
		return finishing;
	}

	await saveBrowserMeeting(record);
	requireOwner(record.ownerId);
	openPart();
	let resumedAt = performance.now();
	let elapsedBeforePause = record.savedDurationMs;
	active = {
		record,
		paused: false,
		stop,
		async pause() {
			if (!active || active.paused) throw "recording_busy";
			elapsedBeforePause += performance.now() - resumedAt;
			active.paused = true;
			clearTimeout(timer);
			track.enabled = false;
			closePart(recorder, true);
			await writes;
			if (failure) throw failure;
		},
		resume() {
			if (!active?.paused || track.readyState !== "live") throw "audio_unavailable";
			track.enabled = true;
			active.paused = false;
			resumedAt = performance.now();
			openPart();
		},
		duration() {
			return elapsedBeforePause + (active?.paused ? 0 : performance.now() - resumedAt);
		},
		level() {
			if (finishing || active?.paused || context.state !== "running") return 0;
			analyser.getFloatTimeDomainData(samples);
			let peak = 0;
			for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
			return Math.min(1, peak);
		},
	};
	document.addEventListener("freeze", suspended);
	window.addEventListener("pagehide", pageHidden);
	track.addEventListener("ended", ended);
	track.addEventListener("mute", ended);
	if (track.readyState !== "live" || track.muted) ended();
}

async function start(ownerId: string, args: Record<string, unknown>, resumed?: MeetingRecording) {
	if (active || starting) throw "recording_busy";
	starting = true;
	let context: AudioContext | undefined;
	try {
		context = new AudioContext();
		const audio = context;
		void audio.resume().catch(() => {});
		await new Promise<void>((resolve, reject) => {
			void navigator.locks
				.request(LOCK, { ifAvailable: true }, async (lock) => {
					if (!lock) throw "recording_busy";
					requireOwner(ownerId);
					const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((cause) => {
						throw cause?.name === "NotAllowedError" ? "permission_denied" : "audio_unavailable";
					});
					await new Promise<void>((release, fail) => {
						const record: MeetingRecording = resumed ?? {
							id: crypto.randomUUID(),
							ownerId,
							title: String(args.title ?? "")
								.trim()
								.slice(0, 200),
							conversationId: typeof args.conversationId === "string" ? args.conversationId : null,
							...(args.separateSpeakers === true ? { separateSpeakers: true } : {}),
							...(args.transportMode === "live" || args.transportMode === "record"
								? { transportMode: args.transportMode }
								: {}),
							state: "recording",
							startedAt: Date.now(),
							endedAt: null,
							durationMs: 0,
							savedDurationMs: 0,
							sampleRate: MEETING_RATE,
							channels: 1,
							segments: [],
							error: null,
						};
						Promise.resolve()
							.then(() => {
								requireOwner(ownerId);
								return capture(record, stream, audio, release);
							})
							.then(resolve, (cause) => {
								for (const track of stream.getTracks()) track.stop();
								fail(cause);
							});
					});
				})
				.catch(reject);
		});
	} catch (cause) {
		void context?.close().catch(() => {});
		throw cause;
	} finally {
		starting = false;
	}
}

/** A page that was closed mid-recording can be continued by a click, while the window is open. */
async function interruptedRecording(ownerId: string, id: string): Promise<MeetingRecording> {
	await state(ownerId);
	const found = (await listBrowserMeetings(ownerId)).find((record) => record.id === id);
	const deadline = found ? resumeDeadline(found) : null;
	if (!found || deadline === null) throw "audio_unavailable";
	if (Date.now() >= deadline) throw "resume_expired";
	return { ...found, state: "recording", endedAt: null, error: null, savedAt: Date.now() };
}

/** Ending an interrupted recording is the user saying it is over: it can be transcribed now. */
async function finalizeInterrupted(ownerId: string, id: string) {
	const found = (await listBrowserMeetings(ownerId)).find((record) => record.id === id);
	if (found?.state !== "interrupted" || !found.segments.length) return;
	await saveBrowserMeeting({ ...found, state: "ended", error: null });
}

export async function browserMeetingCommand(command: string, args: Record<string, unknown>) {
	if (command === "set_owner") {
		const next = typeof args.ownerId === "string" ? args.ownerId : null;
		if (next !== owner) {
			owner = next;
			await active?.stop("owner_changed");
		}
		return await state(next);
	}
	const requested = requireOwner(args.ownerId);
	switch (command) {
		case "start":
			await start(requested, args);
			break;
		case "stop":
			if (active?.record.id === args.recordingId && active?.record.ownerId === requested) await active.stop();
			else if (!active) await finalizeInterrupted(requested, String(args.recordingId));
			break;
		case "pause":
			if (!active || active.record.id !== args.recordingId || active.record.ownerId !== requested)
				throw "recording_busy";
			await active.pause();
			break;
		case "resume":
			if (!active) {
				await start(requested, {}, await interruptedRecording(requested, String(args.recordingId)));
				break;
			}
			if (active.record.id !== args.recordingId || active.record.ownerId !== requested) throw "recording_busy";
			active.resume();
			break;
		case "read_audio": {
			const bytes = await readBrowserMeeting(requested, String(args.recordingId), Number(args.segmentIndex));
			requireOwner(requested);
			return bytes;
		}
		case "get_state":
			break;
		default:
			throw "failed";
	}
	return await state(requested);
}
