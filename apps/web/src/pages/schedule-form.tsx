import type { ScheduleAction, ScheduleKind } from "@yonder/protocol";
import { Button, Field, InputFrame, Segmented, TextArea, TextField } from "@yonder/ui-components";
import { ApiError, useScheduleActions } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fromLocalInput, localInputValue } from "./schedule-format.ts";

const KINDS: ScheduleKind[] = ["once", "daily", "weekly"];
const ACTIONS: ScheduleAction[] = ["task", "reminder"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const DEFAULT_TIMEZONE = "Asia/Shanghai";

/**
 * The new-plan form: title, whether it is a reminder or a task, what to send or do, when, and in
 * which zone. Nothing is invented for the user.
 */
export function ScheduleForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
	const { t } = useTranslation();
	const actions = useScheduleActions();
	const [title, setTitle] = useState("");
	const [action, setAction] = useState<ScheduleAction>("task");
	const [instruction, setInstruction] = useState("");
	const [message, setMessage] = useState("");
	const [kind, setKind] = useState<ScheduleKind>("daily");
	const [time, setTime] = useState("09:00");
	const [date, setDate] = useState(() => localInputValue(DEFAULT_TIMEZONE, new Date(Date.now() + 60 * 60 * 1000)));
	const [weekdays, setWeekdays] = useState<number[]>([1]);
	const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
	const [error, setError] = useState<string | null>(null);
	const timezoneError = !isTimeZone(timezone);
	const valid =
		title.trim().length > 0 &&
		(action === "reminder" ? message.trim().length > 0 : instruction.trim().length > 0) &&
		!timezoneError &&
		(kind !== "weekly" || weekdays.length > 0) &&
		(kind !== "once" || fromLocalInput(timezone, date) !== null);

	async function submit() {
		setError(null);
		const at = kind === "once" ? fromLocalInput(timezone, date)?.toISOString() : time;
		if (!at) {
			setError(t("tasks.invalidTime"));
			return;
		}
		try {
			await actions.create.mutateAsync({
				title: title.trim(),
				action,
				...(action === "reminder" ? { message: message.trim() } : { instruction: instruction.trim() }),
				kind,
				at,
				timezone,
				...(kind === "weekly" ? { weekdays } : {}),
			});
			onDone();
		} catch (failure) {
			// The real reason, never a made-up success.
			setError(failure instanceof ApiError ? t(failure.messageKey) : t("tasks.createFailed"));
		}
	}

	return (
		<form
			className="flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)]"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<TextField
				label={t("tasks.scheduleTitle")}
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				maxLength={120}
			/>
			<Field label={t("tasks.scheduleAction")} htmlFor="schedule-action">
				<Segmented
					options={ACTIONS.map((value) => ({ value, label: t(actionLabel(value)) }))}
					value={action}
					onChange={(value) => setAction(value as ScheduleAction)}
					aria-label={t("tasks.scheduleAction")}
				/>
			</Field>
			{action === "reminder" ? (
				<Field label={t("tasks.scheduleMessage")} htmlFor="schedule-message">
					<TextArea
						id="schedule-message"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						maxLength={2000}
					/>
				</Field>
			) : (
				<Field label={t("tasks.scheduleInstruction")} htmlFor="schedule-instruction">
					<TextArea
						id="schedule-instruction"
						value={instruction}
						onChange={(event) => setInstruction(event.target.value)}
						maxLength={8000}
					/>
				</Field>
			)}
			<Field label={t("tasks.scheduleKind")} htmlFor="schedule-kind">
				<Segmented
					options={KINDS.map((value) => ({ value, label: t(kindLabel(value)) }))}
					value={kind}
					onChange={(value) => setKind(value as ScheduleKind)}
					aria-label={t("tasks.scheduleKind")}
				/>
			</Field>
			{kind === "once" ? (
				<Field label={t("tasks.scheduleDate")} htmlFor="schedule-date">
					<InputFrame>
						<input
							id="schedule-date"
							type="datetime-local"
							step={1}
							value={date}
							onChange={(event) => setDate(event.target.value)}
							className="min-w-0 w-full flex-1 bg-transparent text-body text-[var(--color-text-primary)] outline-none"
						/>
					</InputFrame>
				</Field>
			) : (
				<Field label={t("tasks.scheduleAt")} htmlFor="schedule-time">
					<InputFrame>
						<input
							id="schedule-time"
							type="time"
							step={1}
							value={time}
							onChange={(event) => setTime(event.target.value)}
							className="min-w-0 w-full flex-1 bg-transparent text-body text-[var(--color-text-primary)] outline-none"
						/>
					</InputFrame>
				</Field>
			)}
			{kind === "weekly" ? (
				<Field label={t("tasks.scheduleWeekdays")} htmlFor="schedule-weekdays">
					<fieldset
						id="schedule-weekdays"
						aria-label={t("tasks.scheduleWeekdays")}
						className="flex flex-wrap gap-[var(--spacing-2)] border-0 p-0"
					>
						{WEEKDAYS.map((day) => (
							<Button
								key={day}
								size="sm"
								variant={weekdays.includes(day) ? "primary" : "secondary"}
								onClick={() =>
									setWeekdays((current) =>
										current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort(),
									)
								}
							>
								{t(`tasks.weekday${day}`)}
							</Button>
						))}
					</fieldset>
				</Field>
			) : null}
			<TextField
				label={t("tasks.scheduleTimezone")}
				value={timezone}
				onChange={(event) => setTimezone(event.target.value)}
				invalid={timezoneError}
				error={timezoneError ? t("tasks.invalidTime") : undefined}
			/>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<div className="flex gap-[var(--spacing-2)]">
				<Button variant="primary" type="submit" disabled={!valid} loading={actions.create.isPending}>
					{t("tasks.save")}
				</Button>
				<Button variant="ghost" onClick={onCancel}>
					{t("app.cancel")}
				</Button>
			</div>
		</form>
	);
}

function actionLabel(action: ScheduleAction): string {
	return action === "reminder" ? "tasks.actionReminder" : "tasks.actionTask";
}

function kindLabel(kind: ScheduleKind): string {
	return kind === "once" ? "tasks.kindOnce" : kind === "daily" ? "tasks.kindDaily" : "tasks.kindWeekly";
}

function isTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}
