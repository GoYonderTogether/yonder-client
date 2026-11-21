import { automaticResume, resumableMeeting } from "@yonder/feature-meetings";
import type { Conversation } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../lib/keychain.ts";
import { isDesktopExperience } from "../lib/platform.ts";
import { useAppNotice } from "./app-notice.tsx";
import { useMeetingLive } from "./use-meeting-live.ts";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";
import { useMeetingUpload } from "./use-meeting-upload.ts";

export function useFrameMeeting(ownerId: string | null) {
	const { t } = useTranslation();
	const notify = useAppNotice();
	const recorder = useMeetingRecorder(ownerId, (error) => {
		notify({ key: `meeting:${error}`, text: t(`meetingRecorder.errors.${error}`), tone: "error" });
	});
	useMeetingUpload(ownerId, recorder);
	const live = useMeetingLive(ownerId, recorder);
	const [shortVoiceActive, setShortVoiceActive] = useState(false);
	const active = recorder.state.recordings.find((recording) => recording.id === recorder.state.activeId);
	const interrupted = resumableMeeting(recorder.state.recordings, Date.now());
	const previous = useRef<{ ownerId: string | null; recordingId: string | null }>(null);
	useEffect(() => {
		const last = previous.current;
		const { activeId, recordings } = recorder.state;
		previous.current = { ownerId, recordingId: activeId };
		if (last?.ownerId !== ownerId || !last.recordingId || last.recordingId === activeId) return;
		if (recordings.find((recording) => recording.id === last.recordingId)?.state !== "interrupted") return;
		notify({ key: `meeting:${last.recordingId}:interrupted`, text: t("meetingRecorder.interrupted"), tone: "warning" });
	}, [ownerId, recorder.state, notify, t]);

	// Only the desktop shell continues by itself. Phones need a tap: a background app may not open the mic.
	const desktop = isTauri() && isDesktopExperience();
	const attempted = useRef(new Set<string>());
	useEffect(() => {
		if (!desktop || !recorder.ready || recorder.busy || active || !interrupted || !recorder.resume) return;
		if (!automaticResume(interrupted) || attempted.current.has(interrupted.id)) return;
		attempted.current.add(interrupted.id);
		void recorder.resume(interrupted.id);
	}, [desktop, recorder, active, interrupted]);

	function start(target: Conversation | undefined, live = false) {
		if (recorder.busy || active || interrupted) return;
		const reason = shortVoiceActive
			? "microphoneOccupied"
			: recorder.ready && !recorder.state.supported
				? "unsupported"
				: target?.kind !== "direct" || target.visit
					? "targetUnavailable"
					: null;
		if (reason) {
			notify({ key: `meeting:${reason}`, text: t(`meetingRecorder.${reason}`), tone: "warning" });
			return;
		}
		if (!target) return;
		void recorder.start(t("meetingRecorder.defaultTitle"), target.id, true, live ? "live" : "record");
	}

	return { recorder, live, active, interrupted, setShortVoiceActive, start };
}
