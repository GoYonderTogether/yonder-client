import { Pause, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingRecorderController } from "./types.ts";
import "./meeting-recorder.css";

export function recordingDuration(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

const DOTS = [0, 1, 2, 3, 4, 5];

export function MeetingRecorderCapsule({
	recorder,
	notice,
}: {
	recorder: MeetingRecorderController;
	notice: { message: string; startedAt: number } | null;
}) {
	const { t } = useTranslation();
	const { activeId, audioLevel, paused, pauseSupported, recordings } = recorder.state;
	const active = recordings.find((item) => item.id === activeId);
	const error = notice?.message ?? (recorder.error ? t(`meetingRecorder.errors.${recorder.error}`) : null);
	const { pause, resume } = recorder;
	if (!active && !error && !recorder.busy) return null;
	const PauseResume = paused ? Play : Pause;
	const canPause = active && pauseSupported && pause && resume;
	return (
		<div className="meeting-capsule-stack">
			{error ? <MeetingNotice key={notice?.startedAt ?? recorder.error} message={error} /> : null}
			{active ? (
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
								onClick={() => void (paused ? resume(active.id) : pause(active.id))}
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
							{recordingDuration(active.durationMs)}
						</output>
					</div>
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
			) : recorder.busy ? (
				<p className="meeting-capsule-notice" role="status">
					{t("app.loading")}
				</p>
			) : null}
		</div>
	);
}

function MeetingNotice({ message }: { message: string }) {
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		const timeout = setTimeout(() => setVisible(false), 5000);
		return () => clearTimeout(timeout);
	}, []);
	return visible ? (
		<p className="meeting-capsule-notice" role="alert">
			{message}
		</p>
	) : null;
}
