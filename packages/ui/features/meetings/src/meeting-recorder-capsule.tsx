import { Pause, Play, Square } from "lucide-react";
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

const DOTS = [0, 1, 2, 3, 4, 5];

export function MeetingRecorderCapsule({ recorder }: { recorder: MeetingRecorderController }) {
	const { t } = useTranslation();
	const { activeId, audioLevel, paused, pauseSupported, recordings } = recorder.state;
	const active = recordings.find((item) => item.id === activeId);
	const interrupted = useResumableMeeting(active ? [] : recordings);
	const { pause, resume } = recorder;
	if (!active && !interrupted && !recorder.busy) return null;
	if (!active && interrupted) {
		const minutes = Math.max(1, Math.ceil(((resumeDeadline(interrupted) ?? 0) - Date.now()) / 60_000));
		return (
			<div className="meeting-capsule-stack">
				<section className="meeting-capsule" aria-label={t("meetingRecorder.interruptedCapsule")}>
					<button
						type="button"
						className="meeting-capsule-control"
						aria-label={t("meetingRecorder.continue")}
						disabled={recorder.busy || !resume}
						onClick={() => void resume?.(interrupted.id)}
					>
						<Play size={16} fill="currentColor" aria-hidden="true" />
					</button>
					<div className="meeting-capsule-clock">
						<div className="meeting-level-bars" data-paused aria-hidden="true">
							{DOTS.map((dot) => (
								<span key={dot} />
							))}
						</div>
						<output aria-label={t("meetingRecorder.elapsed")} aria-live="off">
							{recordingDuration(interrupted.savedDurationMs)}
						</output>
					</div>
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
	const activeRecording = active;
	const PauseResume = paused ? Play : Pause;
	const canPause = active && pauseSupported && pause && resume;
	return (
		<div className="meeting-capsule-stack">
			{activeRecording ? (
				<section
					className="meeting-capsule"
					aria-label={t(paused ? "meetingRecorder.paused" : "meetingRecorder.recording")}
				>
					<div className="meeting-capsule-control-slot">
						{canPause ? (
							<button
								type="button"
								className="meeting-capsule-control"
								aria-label={t(paused ? "meetingRecorder.resume" : "meetingRecorder.pause")}
								disabled={recorder.busy}
								onClick={() => void (paused ? resume(activeRecording.id) : pause(activeRecording.id))}
							>
								<PauseResume size={16} fill="currentColor" aria-hidden="true" />
							</button>
						) : null}
					</div>
					<div className="meeting-capsule-clock">
						{!paused && audioLevel !== undefined ? (
							<meter
								className="sr-only"
								min={0}
								max={100}
								value={Math.round(audioLevel * 100)}
								aria-label={t("meetingRecorder.audioLevel")}
							/>
						) : null}
						<div className="meeting-level-bars" data-paused={paused || undefined} aria-hidden="true">
							{DOTS.map((dot) => (
								<span
									key={dot}
									data-peak={!paused && dot < Math.ceil((audioLevel ?? 0) * DOTS.length) ? true : undefined}
								/>
							))}
						</div>
						<output aria-label={t("meetingRecorder.elapsed")} aria-live="off">
							{recordingDuration(activeRecording.durationMs)}
						</output>
					</div>
					<button
						type="button"
						className="meeting-capsule-control"
						aria-label={t("meetingRecorder.stop")}
						disabled={recorder.busy}
						onClick={() => void recorder.stop(activeRecording.id)}
					>
						<Square size={12} fill="currentColor" aria-hidden="true" />
					</button>
				</section>
			) : recorder.busy ? (
				<p className="meeting-capsule-notice" role="status">
					{t("app.loading")}
				</p>
			) : null}
		</div>
	);
}
