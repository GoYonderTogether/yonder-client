import type { MeetingRecorderController, MeetingRecorderState } from "@yonder/feature-meetings";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	EMPTY_RECORDER,
	invokeMeetingRecorder,
	meetingRecorderSupported,
	readMeetingAudio,
} from "../lib/meeting-recorder.ts";

/** The native state is JSON; a shell without the plugin answers nothing, which is not a recording. */
function recorderState(value: unknown): MeetingRecorderState {
	const candidate = value as Partial<MeetingRecorderState> | null | undefined;
	return candidate && Array.isArray(candidate.recordings)
		? {
				supported: Boolean(candidate.supported),
				activeId: candidate.activeId ?? null,
				recordings: candidate.recordings,
			}
		: EMPTY_RECORDER;
}

const ERROR_CODES = new Set([
	"permission_denied",
	"recording_busy",
	"owner_mismatch",
	"storage_failed",
	"audio_unavailable",
]);
function errorCode(error: unknown): string {
	const code = String(error).split(":")[0] ?? "";
	if (code === "microphone_denied") return "permission_denied";
	if (code === "notifications_denied" || code === "notifications_disabled") return "notifications_required";
	if (code === "meeting_already_recording") return "recording_busy";
	if (code === "meeting_owner_mismatch" || code === "wrong_owner" || code === "meeting_recorder_wrongOwner")
		return "owner_mismatch";
	if (code === "meeting_microphone_unavailable" || code === "microphone_unavailable") return "audio_unavailable";
	if (code.startsWith("meeting_storage") || code === "meeting_recorder_storageFailed") return "storage_failed";
	return ERROR_CODES.has(code) ? code : "failed";
}

/** State observes the native recorder; unmounting a view never stops capture. */
export function useMeetingRecorder(ownerId: string | null): MeetingRecorderController {
	const [state, setState] = useState<MeetingRecorderState>(EMPTY_RECORDER);
	const [stateOwner, setStateOwner] = useState(ownerId);
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const owner = useRef(ownerId);
	owner.current = ownerId;
	const supported = meetingRecorderSupported();
	const reload = useCallback(async () => {
		if (!supported || !ownerId) return;
		try {
			const next = recorderState(await invokeMeetingRecorder<unknown>("set_owner", { ownerId }));
			if (owner.current !== ownerId) return;
			setState(next);
			setStateOwner(ownerId);
			setError(null);
			setReady(true);
		} catch (cause) {
			if (owner.current === ownerId) setError(errorCode(cause));
		}
	}, [ownerId, supported]);
	useEffect(() => {
		setState(EMPTY_RECORDER);
		setStateOwner(ownerId);
		setReady(!supported);
		setBusy(false);
		setError(null);
		if (!supported || !ownerId) return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function observe(first: boolean) {
			try {
				const next = recorderState(
					await invokeMeetingRecorder<unknown>(first ? "set_owner" : "get_state", { ownerId }),
				);
				if (disposed) return;
				setState(next);
				setStateOwner(ownerId);
				setReady(true);
				if (first) setError(null);
			} catch (cause) {
				if (disposed) return;
				setReady(true);
				setError(errorCode(cause));
			}
			if (!disposed) timer = setTimeout(() => void observe(false), 1000);
		}
		void observe(true);
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [ownerId, supported]);
	async function action(command: "start" | "stop", args: Record<string, unknown>) {
		if (!supported || !ownerId || busy) return;
		setBusy(true);
		setError(null);
		try {
			const next = recorderState(await invokeMeetingRecorder<unknown>(command, { ownerId, ...args }));
			if (owner.current === ownerId) setState(next);
		} catch (cause) {
			if (owner.current === ownerId) setError(errorCode(cause));
		} finally {
			if (owner.current === ownerId) setBusy(false);
		}
	}
	return {
		state: stateOwner === ownerId ? state : EMPTY_RECORDER,
		ready: stateOwner === ownerId && ready,
		busy: stateOwner === ownerId && busy,
		error: stateOwner === ownerId ? error : null,
		start: (title, conversationId) => action("start", { title, ...(conversationId ? { conversationId } : {}) }),
		stop: (recordingId) => action("stop", { recordingId }),
		reload,
		readAudio: async (recordingId, segmentIndex) => {
			if (!ownerId || owner.current !== ownerId) throw new Error("owner_mismatch");
			const bytes = await readMeetingAudio(ownerId, recordingId, segmentIndex);
			if (owner.current !== ownerId) throw new Error("owner_mismatch");
			return bytes;
		},
	};
}
