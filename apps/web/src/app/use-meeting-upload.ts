import { type MeetingRecorderController, type MeetingUploadJob, meetingUploadReady } from "@yonder/feature-meetings";
import { keys, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useEffectEvent, useRef } from "react";
import { apiBaseUrl } from "../lib/config.ts";
import { isTauri } from "../lib/keychain.ts";
import { invokeMeetingRecorder } from "../lib/meeting-recorder.ts";
import { isDesktopExperience } from "../lib/platform.ts";
import { uploadMeetingAudio } from "../lib/upload-meeting-audio.ts";

const RETRY_MS = 30_000;

/** Desktop owns a persistent native queue. Elsewhere, resume saved recordings when the app can run. */
export function useMeetingUpload(ownerId: string | null, recorder: MeetingRecorderController) {
	const { client, api, storage } = useData();
	const query = useDataQueryClient();
	const desktop = isTauri() && isDesktopExperience();
	const { ready, state } = recorder;
	const owner = useRef(ownerId);
	owner.current = ownerId;
	const attempts = useRef(new Map<string, number>());
	const submitting = useRef(false);

	useEffect(() => {
		owner.current = ownerId;
		return () => {
			owner.current = null;
		};
	}, [ownerId]);

	useEffect(() => {
		if (!desktop || !ready || !state.supported || !ownerId) return;
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
				const signature = JSON.stringify(next.map((job) => [job.meetingId, job.state]));
				if (signature !== previous) {
					previous = signature;
					void query.invalidateQueries({ queryKey: keys.items.all() });
				}
			} catch {
				// The native queue keeps saved audio while its session or network is unavailable.
			}
			if (!disposed) timer = setTimeout(() => void observe(), 1000);
		}
		void observe();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [desktop, ownerId, ready, state.supported, client, query]);

	const submitSaved = useEffectEvent(async (reconnected: boolean) => {
		if (!ownerId || !ready || !state.supported || submitting.current) return;
		submitting.current = true;
		try {
			for (const recording of state.recordings) {
				if (owner.current !== ownerId) break;
				const { id, conversationId } = recording;
				if (
					recording.ownerId !== ownerId ||
					recording.transportMode ||
					!conversationId ||
					!meetingUploadReady(recording, Date.now())
				)
					continue;
				const key = `meeting-upload.${ownerId}.${id}`;
				const retryAt = attempts.current.get(key) ?? 0;
				if (retryAt === Infinity || (!reconnected && retryAt > Date.now())) continue;
				attempts.current.set(key, Infinity);
				if (storage.get(key) === "submitted") continue;
				function assertOwner() {
					if (owner.current !== ownerId) throw new Error("owner_mismatch");
				}
				try {
					await uploadMeetingAudio(api, recording, conversationId, recorder.readAudio, assertOwner);
					assertOwner();
					storage.set(key, "submitted");
					void query.invalidateQueries({ queryKey: keys.items.all() });
				} catch {
					attempts.current.set(key, Date.now() + RETRY_MS);
				}
			}
		} finally {
			submitting.current = false;
		}
	});
	useEffect(() => {
		if (!desktop && state.recordings.length) void submitSaved(false);
	}, [desktop, state.recordings]);
	useEffect(() => {
		if (desktop) return;
		const resume = () => void submitSaved(true);
		window.addEventListener("online", resume);
		return () => window.removeEventListener("online", resume);
	}, [desktop]);
}
