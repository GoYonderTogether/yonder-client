import type { MeetingRecorderController, MeetingRecording, MeetingUploadJob } from "@yonder/feature-meetings";
import { keys, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { apiBaseUrl } from "../lib/config.ts";
import { isTauri } from "../lib/keychain.ts";
import { invokeMeetingRecorder } from "../lib/meeting-recorder.ts";
import { isDesktopShell } from "../lib/platform.ts";
import { uploadMeetingAudio } from "../lib/upload-meeting-audio.ts";

/** Desktop observes its native queue. Web uploads saved segments while the page is running. */
export function useMeetingUpload(ownerId: string | null, recorder: MeetingRecorderController) {
	const { client, api } = useData();
	const query = useDataQueryClient();
	const [jobs, setJobs] = useState<MeetingUploadJob[]>([]);
	const [jobsOwner, setJobsOwner] = useState(ownerId);
	const [error, setError] = useState(false);
	const uploading = useRef(new Set<string>());
	const desktop = isDesktopShell();
	const web = !isTauri();
	const available = recorder.state.supported && (desktop || web);
	const ready = recorder.ready;
	const owner = useRef(ownerId);
	owner.current = ownerId;
	useEffect(() => {
		setJobs([]);
		setError(false);
		if (!desktop || !ready || !ownerId) return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let configured: string | null = null;
		let refreshed: string | null = null;
		let previous = "";
		async function observe() {
			try {
				const next = await invokeMeetingRecorder<MeetingUploadJob[]>("get_upload_jobs", { ownerId });
				if (disposed) return;
				if (
					next.some((job) => job.state === "authentication_required") &&
					client.accessToken &&
					refreshed !== client.accessToken
				) {
					refreshed = client.accessToken;
					await client.refreshSession();
				}
				if (disposed) return;
				const token = client.accessToken;
				if (token && token !== configured) {
					await invokeMeetingRecorder("configure_upload", {
						ownerId,
						baseUrl: apiBaseUrl({ shell: true, dev: import.meta.env.DEV }) || window.location.origin,
						accessToken: token,
					});
					configured = token;
				}
				if (disposed) return;
				setJobs(next);
				setJobsOwner(ownerId);
				setError(false);
				const signature = JSON.stringify(next.map((job) => [job.meetingId, job.state]));
				if (signature !== previous) {
					previous = signature;
					void query.invalidateQueries({ queryKey: keys.meetings.all() });
				}
			} catch {
				if (!disposed) setError(true);
			}
			if (!disposed) timer = setTimeout(() => void observe(), 1000);
		}
		void observe();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [desktop, ownerId, ready, client, query]);
	async function prepare(recording: MeetingRecording, conversationId: string) {
		const recordingId = recording.id;
		function assertOwner() {
			if (!ownerId || owner.current !== ownerId || recording.ownerId !== ownerId) throw new Error("owner_mismatch");
		}
		assertOwner();
		if (!available) throw new Error("audio_unavailable");
		if (web) {
			if (uploading.current.has(recordingId)) return;
			uploading.current.add(recordingId);
			const destination =
				recording.conversationId ??
				jobs.find((job) => job.recordingId === recordingId)?.conversationId ??
				conversationId;
			function update(state: MeetingUploadJob["state"], meetingId: string | null) {
				if (owner.current !== ownerId) return;
				setJobsOwner(ownerId);
				setJobs((previous) => [
					...previous.filter((job) => job.recordingId !== recordingId),
					{ recordingId, conversationId: destination, meetingId, state, errorCode: null },
				]);
			}
			update("uploading", null);
			try {
				const meeting = await uploadMeetingAudio(api, recording, destination, recorder.readAudio, assertOwner);
				update("submitted", meeting.id);
			} catch (cause) {
				update("failed", null);
				throw cause;
			} finally {
				uploading.current.delete(recordingId);
				void query.invalidateQueries({ queryKey: keys.meetings.all() });
			}
			return;
		}
		if (jobs.some((job) => job.recordingId === recordingId && job.state === "authentication_required")) {
			await client.refreshSession();
			if (owner.current !== ownerId) return;
		}
		await invokeMeetingRecorder("queue_upload", { ownerId, recordingId, conversationId });
	}
	const uploadEnded = useEffectEvent((recording: MeetingRecording) => {
		if (recording.conversationId) void prepare(recording, recording.conversationId).catch(() => {});
	});
	const previousActive = useRef<string | null>(null);
	const { activeId, recordings } = recorder.state;
	useEffect(() => {
		if (!web) return;
		if (activeId) {
			previousActive.current = activeId;
			return;
		}
		const finished = recordings.find(
			(recording) => recording.id === previousActive.current && recording.state !== "recording",
		);
		if (!finished) return;
		previousActive.current = null;
		if (finished.state === "ended") uploadEnded(finished);
	}, [web, activeId, recordings]);
	return {
		jobs: jobsOwner === ownerId ? jobs : [],
		error,
		available,
		web,
		prepare,
	};
}
