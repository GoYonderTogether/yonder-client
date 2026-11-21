import { Square } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingRecorderController } from "./types.ts";
import "./meeting-recorder.css";

export function recordingDuration(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

export function MeetingRecorderCapsule({
	recorder,
	caption,
	offline,
	live,
	hiddenWhileExpanded,
	onExpand,
	capsuleRef,
}: {
	recorder: MeetingRecorderController;
	caption?: string | undefined;
	offline?: boolean;
	live?: boolean;
	hiddenWhileExpanded?: boolean;
	onExpand?: (() => void) | undefined;
	capsuleRef?: Ref<HTMLElement>;
}) {
	const { t } = useTranslation();
	const { activeId, recordings } = recorder.state;
	const active = recordings.find((item) => item.id === activeId);
	if (!active) return null;
	const readout = (
		<>
			<span className="meeting-recording-dot" aria-hidden="true" />
			<output aria-label={t("meetingRecorder.elapsed")} aria-live="off">
				{recordingDuration(active.durationMs)}
			</output>
			<span className="meeting-capsule-caption">
				{offline
					? t("meetingRecorder.offlineLive")
					: caption || t(live ? "meetingRecorder.liveTitle" : "meetingRecorder.recording")}
			</span>
		</>
	);
	return (
		<div
			className="meeting-capsule-stack"
			data-measure-only={hiddenWhileExpanded || undefined}
			aria-hidden={hiddenWhileExpanded || undefined}
			inert={hiddenWhileExpanded}
		>
			<section ref={capsuleRef} className="meeting-capsule" aria-label={t("meetingRecorder.recording")}>
				{onExpand ? (
					<button
						type="button"
						className="meeting-capsule-expand"
						onClick={onExpand}
						aria-label={t("meetingRecorder.expand")}
						aria-haspopup="dialog"
					>
						{readout}
					</button>
				) : (
					<div className="meeting-capsule-readout">{readout}</div>
				)}
				<button
					type="button"
					className="meeting-capsule-control"
					aria-label={t("meetingRecorder.stop")}
					disabled={recorder.busy}
					onClick={() => void recorder.stop(active.id)}
				>
					<Square size={12} fill="currentColor" aria-hidden="true" />
				</button>
			</section>
		</div>
	);
}
