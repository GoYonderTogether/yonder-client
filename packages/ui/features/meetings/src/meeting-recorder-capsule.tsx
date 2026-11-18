import { Button, TextField } from "@yonder/ui-components";
import { ChevronUp, Pause, Play, Radio, Square, UsersRound } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { MeetingProcessing } from "./meeting-processing.tsx";
import { RecordingPlayer } from "./recording-player.tsx";
import type { MeetingCloudController, MeetingRecorderController } from "./types.ts";
import "./meeting-recorder.css";

export function recordingDuration(ms: number): string {
	const seconds = Math.floor(Math.max(0, ms) / 1000);
	return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

function AudioLevel({ level, label }: { level: number; label: string }) {
	const [history, setHistory] = useState<number[]>([]);
	useEffect(() => {
		setHistory((previous) => (level === 0 ? [] : [...previous.slice(-15), level]));
	}, [level]);
	return (
		<div className="meeting-level">
			<meter className="meeting-level-meter" min={0} max={100} value={Math.round(level * 100)} aria-label={label} />
			<div className="meeting-level-bars" aria-hidden="true">
				{history.map((value, index) => (
					// Slots represent positions in a rolling history, not persistent items.
					// biome-ignore lint/suspicious/noArrayIndexKey: rolling display slots
					<span key={index} style={{ height: `${Math.max(2, value * 100)}%` }} />
				))}
			</div>
		</div>
	);
}

/** The composer owns presentation only; collapsing never stops native capture. */
export function MeetingRecorderCapsule({
	recorder,
	microphoneOccupied = false,
	expanded,
	onToggle,
	cloud,
	canStart = true,
	renderSummary,
}: {
	recorder: MeetingRecorderController;
	microphoneOccupied?: boolean;
	expanded: boolean;
	onToggle(): void;
	cloud?: MeetingCloudController;
	canStart?: boolean;
	renderSummary?: (text: string) => ReactNode;
}) {
	const { t, i18n } = useTranslation();
	const previewId = useId();
	const [title, setTitle] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const records = recorder.state.recordings;
	const active = records.find((item) => item.id === recorder.state.activeId);
	const selected = records.find((item) => item.id === selectedId) ?? active ?? records[0];
	const meeting =
		cloud?.selected ??
		cloud?.records.find((item) => item.clientRecordingId === selected?.id) ??
		(!selected ? cloud?.records[0] : undefined);
	const job = cloud?.jobs.find((item) => item.recordingId === selected?.id);
	const headline = active ?? selected;
	const startDisabled = !recorder.ready || recorder.busy || microphoneOccupied || !canStart;
	function start(separateSpeakers?: boolean) {
		if (startDisabled) return;
		setSelectedId(null);
		cloud?.select(null);
		void recorder.start(title.trim() || t("meetingRecorder.defaultTitle"), undefined, separateSpeakers);
	}
	if (!expanded && !headline && !meeting && !recorder.error) return null;
	return (
		<section
			className="meeting-capsule"
			data-expanded={expanded}
			data-recording={Boolean(active)}
			aria-label={t("meetingRecorder.name")}
		>
			<div className="meeting-capsule-header">
				<button
					type="button"
					className="meeting-capsule-toggle"
					aria-expanded={expanded}
					aria-controls={previewId}
					onClick={onToggle}
				>
					<Radio size={17} aria-hidden="true" className={active ? "text-[var(--color-danger)]" : ""} />
					<span className="min-w-0 truncate">
						{active
							? t(recorder.state.paused ? "meetingRecorder.paused" : "meetingRecorder.recording")
							: meeting
								? t(`meetingRecorder.processing.${meeting.status}`)
								: headline
									? t(`meetingRecorder.${headline.state}`)
									: t("meetingRecorder.name")}
					</span>
					{headline || meeting ? (
						<output className="shrink-0 tabular-nums" aria-label={t("meetingRecorder.elapsed")}>
							{recordingDuration(active?.durationMs ?? meeting?.durationMs ?? headline?.durationMs ?? 0)}
						</output>
					) : null}
					<ChevronUp size={16} aria-hidden="true" className="meeting-capsule-chevron" />
				</button>
				{active && !recorder.state.paused && recorder.state.audioLevel !== undefined ? (
					<AudioLevel key={active.id} level={recorder.state.audioLevel} label={t("meetingRecorder.audioLevel")} />
				) : null}
				{active && recorder.state.pauseSupported && recorder.pause && recorder.resume ? (
					<Button
						className="meeting-stop"
						size="sm"
						variant="danger"
						loading={recorder.busy}
						onClick={() => void (recorder.state.paused ? recorder.resume?.(active.id) : recorder.pause?.(active.id))}
					>
						{recorder.state.paused ? (
							<Play size={13} fill="currentColor" aria-hidden="true" />
						) : (
							<Pause size={13} fill="currentColor" aria-hidden="true" />
						)}
						{t(recorder.state.paused ? "meetingRecorder.resume" : "meetingRecorder.pause")}
					</Button>
				) : null}
				{active ? (
					<Button
						className="meeting-stop"
						size="sm"
						variant="danger"
						loading={recorder.busy}
						onClick={() => void recorder.stop(active.id)}
					>
						<Square size={13} fill="currentColor" aria-hidden="true" />
						{t("meetingRecorder.stop")}
					</Button>
				) : null}
			</div>
			<div className="meeting-capsule-reveal" id={previewId} inert={!expanded} aria-hidden={!expanded}>
				<div className="meeting-capsule-clip">
					<div className="meeting-capsule-preview">
						{!recorder.ready ? <p role="status">{t("app.loading")}</p> : null}
						{recorder.error ? (
							<div
								role="alert"
								className="flex items-center justify-between gap-[var(--spacing-2)] text-[var(--color-danger)]"
							>
								<span>{t(`meetingRecorder.errors.${recorder.error}`)}</span>
								<Button size="sm" disabled={recorder.busy} onClick={() => void recorder.reload()}>
									{t("app.retry")}
								</Button>
							</div>
						) : null}
						{recorder.ready && !recorder.state.supported && !selected && !meeting && !cloud?.loading ? (
							<p role="status">{t("meetingRecorder.unsupported")}</p>
						) : null}
						{cloud?.loading ? <p role="status">{t("app.loading")}</p> : null}
						{cloud?.error ? (
							<div role="alert" className="text-caption text-[var(--color-danger)]">
								{t("meetingRecorder.processingFailed")}{" "}
								<Button size="sm" onClick={cloud.reload}>
									{t("app.retry")}
								</Button>
							</div>
						) : null}
						{selected && !cloud?.selected ? (
							<article className="flex flex-col gap-[var(--spacing-2)]">
								<h3 className="break-words text-h3">{selected.title}</h3>
								<p className="text-caption text-[var(--color-text-secondary)]">
									{t("meetingRecorder.saved", { duration: recordingDuration(selected.savedDurationMs) })}
								</p>
								{selected.state === "interrupted" ? (
									<p className="text-caption">{t("meetingRecorder.interruptedHelp")}</p>
								) : null}
								{expanded && selected.state !== "recording" ? (
									<RecordingPlayer key={selected.id} recording={selected} readAudio={recorder.readAudio} />
								) : null}
								{cloud?.uploadAvailable &&
								selected.state !== "recording" &&
								selected.segments.length > 0 &&
								((!job && !meeting) || job?.state === "failed" || job?.state === "authentication_required") ? (
									<Button
										size="sm"
										disabled={cloud.busy || !cloud.targetName}
										onClick={() => void cloud.prepare(selected.id)}
									>
										{job ? t("meetingRecorder.retryUpload") : t("meetingRecorder.prepare", { name: cloud.targetName })}
									</Button>
								) : null}
								{job && (!meeting || ["failed", "authentication_required", "queued"].includes(job.state)) ? (
									<p role="status" className="text-caption">
										{t(`meetingRecorder.upload.${job.state}`)}
									</p>
								) : null}
							</article>
						) : null}
						{meeting && cloud ? (
							<div className="flex flex-col gap-[var(--spacing-2)]">
								{cloud.selected || !selected ? <h3 className="break-words text-h3">{meeting.title}</h3> : null}
								<MeetingProcessing
									key={meeting.id}
									meeting={meeting}
									cloud={cloud}
									{...(renderSummary ? { renderSummary } : {})}
								/>
							</div>
						) : null}
						{recorder.state.supported && !active ? (
							<form
								className="flex flex-col gap-[var(--spacing-2)]"
								onSubmit={(event) => {
									event.preventDefault();
									start();
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
									<p role="status" className="text-caption">
										{t("meetingRecorder.microphoneOccupied")}
									</p>
								) : null}
								{!canStart ? (
									<p role="status" className="text-caption">
										{t("meetingRecorder.targetUnavailable")}
									</p>
								) : cloud?.uploadAvailable ? (
									<p className="text-caption text-[var(--color-text-secondary)]">
										{t("meetingRecorder.uploadAfterEnd", { name: cloud.targetName })}
									</p>
								) : null}
								<div className="flex flex-wrap gap-[var(--spacing-2)]">
									<Button type="submit" size="sm" variant="primary" loading={recorder.busy} disabled={startDisabled}>
										{t("meetingRecorder.start")}
									</Button>
									{cloud?.uploadAvailable ? (
										<Button size="sm" disabled={startDisabled} onClick={() => start(true)}>
											<UsersRound size={16} aria-hidden="true" />
											{t("chatActions.recordMeetingWithSpeakers")}
										</Button>
									) : null}
								</div>
							</form>
						) : null}
						{records.some((item) => item.state !== "recording") ? (
							<details className="text-caption">
								<summary className="cursor-pointer py-[var(--spacing-2)]">{t("meetingRecorder.history")}</summary>
								<div className="flex flex-col gap-[var(--spacing-1)]">
									{records
										.filter((item) => item.state !== "recording")
										.map((recording) => (
											<button
												type="button"
												key={recording.id}
												aria-pressed={selected?.id === recording.id && !cloud?.selected}
												onClick={() => {
													setSelectedId(recording.id);
													cloud?.select(null);
												}}
												className="flex min-w-0 items-center justify-between gap-[var(--spacing-2)] rounded-[var(--radius-sm)] p-[var(--spacing-2)] text-left hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
											>
												<span className="truncate">{recording.title}</span>
												<time className="shrink-0 text-[var(--color-text-secondary)]">
													{new Intl.DateTimeFormat(i18n.resolvedLanguage, {
														month: "numeric",
														day: "numeric",
														hour: "2-digit",
														minute: "2-digit",
													}).format(recording.startedAt)}
												</time>
											</button>
										))}
								</div>
							</details>
						) : null}
						{cloud?.records.length ? (
							<details className="text-caption">
								<summary className="cursor-pointer py-[var(--spacing-2)]">{t("meetingRecorder.cloudHistory")}</summary>
								<div className="flex flex-col gap-[var(--spacing-1)]">
									{cloud.records.map((item) => (
										<button
											type="button"
											key={item.id}
											className="rounded-[var(--radius-sm)] p-[var(--spacing-2)] text-left hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
											onClick={() => cloud.select(item.id)}
										>
											{item.title}
										</button>
									))}
								</div>
							</details>
						) : null}
					</div>
				</div>
			</div>
		</section>
	);
}
