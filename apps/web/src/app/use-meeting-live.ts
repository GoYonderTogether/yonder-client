import { NetworkError } from "@yonder/api-client";
import type { MeetingRecorderController } from "@yonder/feature-meetings";
import { keys, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { drainMeetingPhotos, listMeetingPhotos } from "../lib/meeting-photos.ts";
import { shouldSyncMeeting, syncMeetingLive } from "../lib/sync-meeting-live.ts";

export interface MeetingLiveStatus {
	caption: { recordingId: string; conversationId: string; text: string; isFinal: boolean; segmentIndex: number } | null;
	transcript: string;
	asrErrorCode: string | null;
	audioAccepted: boolean;
	syncFailed: boolean;
	offline: boolean;
	meetingId: string | null;
}

const EMPTY: MeetingLiveStatus = {
	caption: null,
	transcript: "",
	asrErrorCode: null,
	audioAccepted: false,
	syncFailed: false,
	offline: false,
	meetingId: null,
};

export function useMeetingLive(ownerId: string | null, recorder: MeetingRecorderController): MeetingLiveStatus {
	const { api, storage } = useData();
	const query = useDataQueryClient();
	const owner = useRef(ownerId);
	owner.current = ownerId;
	const latest = useRef(recorder);
	latest.current = recorder;
	const interruptions = useRef(new Map<string, { endedAt: number; acknowledged: boolean }>());
	const interruptionOwner = useRef(ownerId);
	useLayoutEffect(() => {
		if (interruptionOwner.current !== ownerId) {
			interruptions.current.clear();
			interruptionOwner.current = ownerId;
		}
		for (const recording of recorder.state.recordings) {
			if (
				recording.ownerId !== ownerId ||
				recording.transportMode !== "live" ||
				recording.state !== "interrupted" ||
				recording.endedAt === null
			)
				continue;
			if (interruptions.current.get(recording.id)?.endedAt !== recording.endedAt) {
				interruptions.current.set(recording.id, { endedAt: recording.endedAt, acknowledged: false });
			}
		}
	}, [ownerId, recorder.state.recordings]);
	const [snapshot, setSnapshot] = useState<{ ownerId: string; recordingId: string; status: MeetingLiveStatus }>();
	const run = useEffectEvent(
		async (id: string, signal: AbortSignal, ids: Map<string, string>, retry: Map<string, number>) => {
			const { ready, state } = latest.current;
			if (!ready || !state.supported) return;
			const records = [...state.recordings].sort(
				(a, b) => Number(b.id === state.activeId) - Number(a.id === state.activeId),
			);
			function assertOwner() {
				if (owner.current !== id) throw new Error("owner_mismatch");
				signal.throwIfAborted();
			}
			for (const recording of records) {
				const { conversationId } = recording;
				if (recording.ownerId !== id || !conversationId || !recording.transportMode) continue;
				const key = `meeting-live-submitted.${id}.${recording.id}`;
				if (storage.get(key) === "1" || (retry.get(recording.id) ?? 0) > Date.now()) continue;
				const current = () => recording.transportMode === "live" && latest.current.state.activeId === recording.id;
				function updateStatus(update: (status: MeetingLiveStatus) => MeetingLiveStatus) {
					if (!current()) return;
					setSnapshot((previous) => {
						const matching = previous?.ownerId === id && previous.recordingId === recording.id ? previous : undefined;
						const status = update(matching?.status ?? EMPTY);
						return matching?.status === status ? matching : { ownerId: id, recordingId: recording.id, status };
					});
				}
				try {
					assertOwner();
					const noAudioEnded =
						!recording.segments.length && recording.state !== "recording" && recording.endedAt !== null;
					const localPhotoCount = noAudioEnded ? (await listMeetingPhotos(id, recording.id)).length : 0;
					if (!shouldSyncMeeting(recording, Date.now(), localPhotoCount)) {
						if (noAudioEnded) retry.set(recording.id, Date.now() + 4000);
						continue;
					}
					const done = await syncMeetingLive({
						api,
						recording,
						meetingId: ids.get(recording.id),
						localPhotoCount,
						captureState:
							recording.state === "ended"
								? undefined
								: recording.state === "interrupted"
									? "interrupted"
									: state.activeId === recording.id && state.paused
										? "paused"
										: "recording",
						notifyInterruption: interruptions.current.get(recording.id)?.acknowledged === false,
						readAudio: latest.current.readAudio,
						signal,
						assertOwner,
						drainPhotos: (meetingId) =>
							drainMeetingPhotos(id, recording.id, async (photo) => {
								assertOwner();
								await api.uploadMeetingLivePhoto(meetingId, photo.id, photo.elapsedMs, photo.image, signal);
							}),
						onProgress: (progress) => {
							ids.set(recording.id, progress.meetingId);
							const interrupted = interruptions.current.get(recording.id);
							if (interrupted && progress.captureState === "interrupted") interrupted.acknowledged = true;
							if (!current()) return;
							const transcript = progress.transcript.trim();
							const text = transcript.split(/\n+/).at(-1) ?? "";
							updateStatus((previous) => ({
								...previous,
								meetingId: progress.meetingId,
								transcript,
								asrErrorCode: progress.errorCode,
								audioAccepted: progress.nextSegmentIndex > 0,
								caption: text
									? {
											recordingId: recording.id,
											conversationId,
											text,
											isFinal: !progress.recording,
											segmentIndex: progress.committedThroughSegmentIndex,
										}
									: null,
							}));
						},
					});
					updateStatus((status) =>
						status.offline || status.syncFailed ? { ...status, offline: false, syncFailed: false } : status,
					);
					if (done) {
						storage.set(key, "1");
						ids.delete(recording.id);
						retry.delete(recording.id);
						interruptions.current.delete(recording.id);
						void query.invalidateQueries({ queryKey: keys.items.all() });
						void query.invalidateQueries({ queryKey: keys.meetings.all() });
					}
				} catch (error) {
					if (signal.aborted || owner.current !== id) return;
					retry.set(recording.id, Date.now() + 4000);
					const offline = error instanceof NetworkError;
					updateStatus((status) => ({ ...status, offline, syncFailed: !offline }));
				}
			}
		},
	);

	useEffect(() => {
		setSnapshot(undefined);
		if (!ownerId) return;
		const controller = new AbortController();
		const ids = new Map<string, string>();
		const retry = new Map<string, number>();
		let timer: ReturnType<typeof setTimeout>;
		let running = false;
		async function tick() {
			if (controller.signal.aborted || running) return;
			running = true;
			clearTimeout(timer);
			try {
				await run(ownerId as string, controller.signal, ids, retry);
			} finally {
				running = false;
				if (!controller.signal.aborted) timer = setTimeout(() => void tick(), 1000);
			}
		}
		const reconnect = () => {
			retry.clear();
			void tick();
		};
		void tick();
		window.addEventListener("online", reconnect);
		return () => {
			controller.abort();
			clearTimeout(timer);
			window.removeEventListener("online", reconnect);
		};
	}, [ownerId]);
	return snapshot?.ownerId === ownerId && snapshot?.recordingId === recorder.state.activeId ? snapshot.status : EMPTY;
}
