import type { MeetingUploadJob } from "@yonder/feature-meetings";
import { keys, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "../lib/config.ts";
import { invokeMeetingRecorder } from "../lib/meeting-recorder.ts";
import { isDesktopShell } from "../lib/platform.ts";

/** Observes a durable native queue. React never reads/retries/uploads the audio files. */
export function useMeetingUpload(ownerId: string | null, ready: boolean) {
	const { client } = useData();
	const query = useDataQueryClient();
	const [jobs, setJobs] = useState<MeetingUploadJob[]>([]);
	const [jobsOwner, setJobsOwner] = useState(ownerId);
	const [error, setError] = useState(false);
	const available = isDesktopShell();
	const owner = useRef(ownerId);
	owner.current = ownerId;
	useEffect(() => {
		setJobs([]);
		setError(false);
		if (!available || !ready || !ownerId) return;
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
	}, [available, ownerId, ready, client, query]);
	return {
		jobs: jobsOwner === ownerId ? jobs : [],
		error,
		available,
		async prepare(recordingId: string, conversationId: string) {
			if (!available || !ownerId || owner.current !== ownerId) return;
			if (jobs.some((job) => job.recordingId === recordingId && job.state === "authentication_required")) {
				await client.refreshSession();
				if (owner.current !== ownerId) return;
			}
			await invokeMeetingRecorder("queue_upload", { ownerId, recordingId, conversationId });
		},
	};
}
