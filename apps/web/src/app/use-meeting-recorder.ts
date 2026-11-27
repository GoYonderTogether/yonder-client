import type { MeetingRecorderController, MeetingRecorderState } from "@yonder/feature-meetings";
import { useCallback, useEffect, useRef, useState } from "react";
import { macPermissionStatus, requestMacMicrophone } from "../lib/mac-permissions.ts";
import {
	EMPTY_RECORDER,
	invokeMeetingRecorder,
	meetingRecorderSupported,
	readMeetingAudio,
} from "../lib/meeting-recorder.ts";
import { isMacDesktopShell } from "../lib/platform.ts";

/** A shell without the plugin answers nothing, which is not a recording. */
function recorderState(value: unknown): MeetingRecorderState {
	const candidate = value as Partial<MeetingRecorderState> | null | undefined;
	return candidate && Array.isArray(candidate.recordings)
		? {
				supported: Boolean(candidate.supported),
				activeId: candidate.activeId ?? null,
				paused: Boolean(candidate.activeId && candidate.paused),
				pauseSupported: Boolean(candidate.pauseSupported),
				...(candidate.activeId && typeof candidate.audioLevel === "number" && Number.isFinite(candidate.audioLevel)
					? { audioLevel: Math.max(0, Math.min(1, candidate.audioLevel)) }
					: {}),
				recordings: candidate.recordings,
			}
		: EMPTY_RECORDER;
}

const ERROR_CODES = new Set([
	"resume_expired",
	"permission_denied",
	"recording_busy",
	"owner_mismatch",
	"storage_failed",
	"audio_unavailable",
]);
function errorCode(error: unknown): string {
	const code = (error instanceof Error ? error.message : String(error)).split(":")[0] ?? "";
	if (code === "microphone_denied") return "permission_denied";
	if (code === "notifications_denied" || code === "notifications_disabled") return "notifications_required";
	if (code === "meeting_already_recording") return "recording_busy";
	if (code === "meeting_owner_mismatch" || code === "wrong_owner" || code === "meeting_recorder_wrongOwner")
		return "owner_mismatch";
	if (code === "meeting_microphone_unavailable" || code === "microphone_unavailable") return "audio_unavailable";
	if (code.startsWith("meeting_storage") || code === "meeting_recorder_storageFailed") return "storage_failed";
	return ERROR_CODES.has(code) ? code : "failed";
}

/** Unmounting a view never stops capture. */
export function useMeetingRecorder(
	ownerId: string | null,
	onActionError?: (code: string) => void,
): MeetingRecorderController & { recover: (recordingId: string) => Promise<void> } {
	const [state, setState] = useState<MeetingRecorderState>(EMPTY_RECORDER);
	const [stateOwner, setStateOwner] = useState(ownerId);
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);
	const owner = useRef(ownerId);
	const actionVersion = useRef(0);
	owner.current = ownerId;
	const supported = meetingRecorderSupported();
	const reload = useCallback(async () => {
		if (!supported || !ownerId) return;
		try {
			const next = recorderState(await invokeMeetingRecorder<unknown>("set_owner", { ownerId }));
			if (owner.current !== ownerId) return;
			setState(next);
			setStateOwner(ownerId);
			setReady(true);
		} catch {
			// The recorder observer will check again.
		}
	}, [ownerId, supported]);
	useEffect(() => {
		actionVersion.current++;
		setState(EMPTY_RECORDER);
		setStateOwner(ownerId);
		setReady(!supported);
		setBusy(false);
		if (!supported || !ownerId) return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		async function observe(first: boolean) {
			let recording = false;
			const version = actionVersion.current;
			try {
				const next = recorderState(
					await invokeMeetingRecorder<unknown>(first ? "set_owner" : "get_state", { ownerId }),
				);
				if (disposed) return;
				if (version !== actionVersion.current) {
					timer = setTimeout(() => void observe(false), 100);
					return;
				}
				recording = Boolean(next.activeId);
				setState(next);
				setStateOwner(ownerId);
				setReady(true);
			} catch {
				if (disposed) return;
				setReady(true);
			}
			if (!disposed) timer = setTimeout(() => void observe(false), recording ? 100 : 1000);
		}
		void observe(true);
		return () => {
			disposed = true;
			actionVersion.current++;
			clearTimeout(timer);
		};
	}, [ownerId, supported]);
	async function action(
		command: "start" | "stop" | "pause" | "resume",
		args: Record<string, unknown>,
		mayRequestPermission = true,
	) {
		if (!supported || !ownerId || busy) return;
		const version = ++actionVersion.current;
		const isCurrent = () => owner.current === ownerId && actionVersion.current === version;
		setBusy(true);
		try {
			if ((command === "start" || command === "resume") && isMacDesktopShell()) {
				const { microphone } = await macPermissionStatus();
				if (!isCurrent()) return;
				const granted =
					microphone === "granted" ||
					(microphone === "default" && mayRequestPermission && (await requestMacMicrophone()));
				if (!isCurrent()) return;
				if (!granted) throw new Error("permission_denied");
			}
			const next = recorderState(await invokeMeetingRecorder<unknown>(command, { ownerId, ...args }));
			if (isCurrent()) setState(next);
		} catch (cause) {
			if (isCurrent()) onActionError?.(errorCode(cause));
		} finally {
			if (isCurrent()) {
				actionVersion.current++;
				setBusy(false);
			}
		}
	}
	return {
		state: stateOwner === ownerId ? state : EMPTY_RECORDER,
		ready: stateOwner === ownerId && ready,
		busy: stateOwner === ownerId && busy,
		start: (title, conversationId, separateSpeakers, transportMode) =>
			action("start", {
				title,
				...(conversationId ? { conversationId } : {}),
				...(separateSpeakers ? { separateSpeakers } : {}),
				...(transportMode ? { transportMode } : {}),
			}),
		stop: (recordingId) => action("stop", { recordingId }),
		pause: (recordingId) => action("pause", { recordingId }),
		resume: (recordingId) => action("resume", { recordingId }),
		recover: (recordingId) => action("resume", { recordingId }, false),
		reload,
		readAudio: async (recordingId, segmentIndex) => {
			if (!ownerId || owner.current !== ownerId) throw new Error("owner_mismatch");
			const bytes = await readMeetingAudio(ownerId, recordingId, segmentIndex);
			if (owner.current !== ownerId) throw new Error("owner_mismatch");
			return bytes;
		},
	};
}
