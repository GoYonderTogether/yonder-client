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
	const desktop = isTauri() && isDesktopExperience();
	const previous = useRef<{ ownerId: string | null; recordingId: string | null; paused: boolean }>(null);
	const attempted = useRef(new Set<string>());
	useEffect(() => {
		const last = previous.current;
		const { activeId, paused, recordings } = recorder.state;
		previous.current = { ownerId, recordingId: activeId, paused: Boolean(paused) };
		if (last?.ownerId !== ownerId || !last.recordingId || last.recordingId === activeId) return;
		if (recordings.find((recording) => recording.id === last.recordingId)?.state !== "interrupted") return;
		notify({ key: `meeting:${last.recordingId}:interrupted`, text: t("meetingRecorder.interrupted"), tone: "warning" });
		// Only recover a live desktop capture observed under this owner. Relaunches and paused captures need a new tap.
		if (!desktop || activeId || last.paused || recorder.busy || interrupted?.id !== last.recordingId) return;
		if (!automaticResume(interrupted) || attempted.current.has(interrupted.id)) return;
		attempted.current.add(interrupted.id);
		void recorder.recover(interrupted.id);
	}, [desktop, interrupted, ownerId, recorder, notify, t]);

	function start(target: Conversation | undefined) {
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
		void recorder.start(t("meetingRecorder.defaultTitle"), target.id, true, "live");
	}

	return { recorder, live, active, interrupted, shortVoiceActive, setShortVoiceActive, start };
}
