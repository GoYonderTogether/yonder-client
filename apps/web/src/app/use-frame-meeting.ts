import type { Conversation } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "./app-notice.tsx";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";
import { useMeetingUpload } from "./use-meeting-upload.ts";

export function useFrameMeeting(ownerId: string | null) {
	const { t } = useTranslation();
	const notify = useAppNotice();
	const recorder = useMeetingRecorder(ownerId, (error) => {
		notify({ key: `meeting:${error}`, text: t(`meetingRecorder.errors.${error}`), tone: "error" });
	});
	useMeetingUpload(ownerId, recorder);
	const [shortVoiceActive, setShortVoiceActive] = useState(false);
	const active = recorder.state.recordings.find((recording) => recording.id === recorder.state.activeId);
	const previous = useRef<{ ownerId: string | null; recordingId: string | null }>(null);
	useEffect(() => {
		const last = previous.current;
		const { activeId, recordings } = recorder.state;
		previous.current = { ownerId, recordingId: activeId };
		if (last?.ownerId !== ownerId || !last.recordingId || last.recordingId === activeId) return;
		if (recordings.find((recording) => recording.id === last.recordingId)?.state !== "interrupted") return;
		notify({ key: `meeting:${last.recordingId}:interrupted`, text: t("meetingRecorder.interrupted"), tone: "warning" });
	}, [ownerId, recorder.state, notify, t]);

	function start(target: Conversation | undefined) {
		if (recorder.busy || active) return;
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
		void recorder.start(t("meetingRecorder.defaultTitle"), target.id, true);
	}

	return { recorder, active, setShortVoiceActive, start };
}
