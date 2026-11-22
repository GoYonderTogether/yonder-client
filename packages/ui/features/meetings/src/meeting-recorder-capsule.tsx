import { Play, Square } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { resumeDeadline, useResumableMeeting } from "./meeting-resume.ts";
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
	const interrupted = useResumableMeeting(active ? [] : recordings);
	const { resume } = recorder;
	// A recording cut short by a restart or a closed page can be continued for a while; the capsule
	// then offers Continue and End instead of the live readout.
	if (!active && interrupted) {
		const minutes = Math.max(1, Math.ceil(((resumeDeadline(interrupted) ?? 0) - Date.now()) / 60_000));
		return (
			<div className="meeting-capsule-stack">
				<section className="meeting-capsule" aria-label={t("meetingRecorder.interruptedCapsule")}>
					<div className="meeting-capsule-readout">
						<output aria-label={t("meetingRecorder.elapsed")} aria-live="off">
							{recordingDuration(interrupted.savedDurationMs)}
						</output>
						<span className="meeting-capsule-caption">{t("meetingRecorder.interrupted")}</span>
					</div>
					<button
						type="button"
						className="meeting-capsule-control"
						aria-label={t("meetingRecorder.continue")}
						disabled={recorder.busy || !resume}
						onClick={() => void resume?.(interrupted.id)}
					>
						<Play size={16} fill="currentColor" aria-hidden="true" />
					</button>
					<button
						type="button"
						className="meeting-capsule-control"
						aria-label={t("meetingRecorder.finish")}
						disabled={recorder.busy}
						onClick={() => void recorder.stop(interrupted.id)}
					>
						<Square size={12} fill="currentColor" aria-hidden="true" />
					</button>
				</section>
				<p className="meeting-capsule-notice" role="status">
					{t("meetingRecorder.interruptedHint", { minutes })}
				</p>
			</div>
		);
	}
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
