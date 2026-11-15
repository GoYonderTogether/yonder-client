import { Button, EmptyState, TextField } from "@yonder/ui-components";
import { FileAudio, Radio, Square } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RecordingPlayer } from "./recording-player.tsx";
import type { MeetingRecorderController } from "./types.ts";

export function recordingDuration(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

export function MeetingRecorderPanel({
	recorder,
	microphoneOccupied = false,
}: {
	recorder: MeetingRecorderController;
	microphoneOccupied?: boolean;
}) {
	const { t, i18n } = useTranslation();
	const [title, setTitle] = useState("");
	const active = recorder.state.recordings.find((item) => item.id === recorder.state.activeId);
	return (
		<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)]">
			{!recorder.ready ? <p role="status">{t("app.loading")}</p> : null}
			{recorder.error ? (
				<div role="alert" className="flex flex-col items-start gap-[var(--spacing-2)] text-[var(--color-danger)]">
					<p>{t(`meetingRecorder.errors.${recorder.error}`)}</p>
					<Button size="sm" onClick={() => void recorder.reload()} disabled={recorder.busy}>
						{t("app.retry")}
					</Button>
				</div>
			) : null}
			{recorder.ready && !recorder.state.supported ? (
				<p role="status" className="text-body text-[var(--color-text-secondary)]">
					{t("meetingRecorder.unsupported")}
				</p>
			) : null}
			{recorder.state.supported ? (
				active ? (
					<section
						className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] p-[var(--spacing-4)]"
						aria-label={t("meetingRecorder.recording")}
					>
						<div className="flex items-center gap-[var(--spacing-2)] text-[var(--color-text-secondary)]">
							<Radio size={16} aria-hidden="true" />
							{t("meetingRecorder.recording")}
						</div>
						<h3 className="break-words text-h3">{active.title}</h3>
						<output className="text-h1 tabular-nums" aria-label={t("meetingRecorder.elapsed")}>
							{recordingDuration(active.durationMs)}
						</output>
						<p className="text-caption text-[var(--color-text-secondary)]">
							{t("meetingRecorder.saved", { duration: recordingDuration(active.savedDurationMs) })}
						</p>
						<Button variant="danger" loading={recorder.busy} onClick={() => void recorder.stop(active.id)}>
							<Square size={16} aria-hidden="true" />
							{t("meetingRecorder.stop")}
						</Button>
					</section>
				) : (
					<form
						className="flex flex-col gap-[var(--spacing-3)]"
						onSubmit={(event) => {
							event.preventDefault();
							if (microphoneOccupied) return;
							void recorder.start(title.trim() || t("meetingRecorder.defaultTitle"));
						}}
					>
						<TextField
							label={t("meetingRecorder.titleLabel")}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							maxLength={160}
							placeholder={t("meetingRecorder.defaultTitle")}
						/>
						{microphoneOccupied ? (
							<p role="status" className="text-caption text-[var(--color-text-secondary)]">
								{t("meetingRecorder.microphoneOccupied")}
							</p>
						) : null}
						<Button
							type="submit"
							variant="primary"
							loading={recorder.busy}
							disabled={!recorder.ready || microphoneOccupied}
						>
							<Radio size={16} aria-hidden="true" />
							{t("meetingRecorder.start")}
						</Button>
					</form>
				)
			) : null}
			{recorder.state.recordings.length ? (
				<section className="flex flex-col gap-[var(--spacing-3)]" aria-label={t("meetingRecorder.history")}>
					<h3 className="text-h3">{t("meetingRecorder.history")}</h3>
					{recorder.state.recordings
						.filter((item) => item.state !== "recording")
						.map((recording) => (
							<article
								key={recording.id}
								className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] p-[var(--spacing-4)]"
							>
								<div className="flex flex-wrap items-start justify-between gap-[var(--spacing-2)]">
									<h4 className="min-w-0 break-words font-medium">{recording.title}</h4>
									<span className="text-caption text-[var(--color-text-secondary)]">
										{t(`meetingRecorder.${recording.state}`)}
									</span>
								</div>
								<p className="text-caption text-[var(--color-text-tertiary)]">
									{new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(
										recording.startedAt,
									)}
								</p>
								<p className="text-body tabular-nums">
									{t("meetingRecorder.saved", { duration: recordingDuration(recording.savedDurationMs) })}
								</p>
								{recording.state === "interrupted" ? (
									<p className="text-caption text-[var(--color-text-secondary)]">
										{t("meetingRecorder.interruptedHelp")}
									</p>
								) : null}
								<RecordingPlayer recording={recording} readAudio={recorder.readAudio} />
							</article>
						))}
				</section>
			) : recorder.ready && recorder.state.supported ? (
				<EmptyState icon={<FileAudio size={24} aria-hidden="true" />} title={t("meetingRecorder.empty")} />
			) : null}
		</div>
	);
}
