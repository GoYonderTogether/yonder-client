import type { Conversation } from "@yonder/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";
import { useMeetingUpload } from "./use-meeting-upload.ts";

export function useFrameMeeting(ownerId: string | null) {
	const { t } = useTranslation();
	const recorder = useMeetingRecorder(ownerId);
	useMeetingUpload(ownerId, recorder);
	const [notice, setNotice] = useState<{ message: string; startedAt: number } | null>(null);
	const [shortVoiceActive, setShortVoiceActive] = useState(false);
	const active = recorder.state.recordings.find((recording) => recording.id === recorder.state.activeId);

	function start(target: Conversation | undefined, separateSpeakers?: boolean) {
		if (recorder.busy || active) return;
		const reason = shortVoiceActive
			? "microphoneOccupied"
			: recorder.ready && !recorder.state.supported
				? "unsupported"
				: target?.kind !== "direct" || target.visit
					? "targetUnavailable"
					: null;
		if (reason) {
			setNotice({ message: t(`meetingRecorder.${reason}`), startedAt: performance.now() });
			return;
		}
		if (!target) return;
		setNotice(null);
		void recorder.start(t("meetingRecorder.defaultTitle"), target.id, separateSpeakers);
	}

	return { recorder, notice, active, setShortVoiceActive, start };
}
