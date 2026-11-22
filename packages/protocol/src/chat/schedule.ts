/**
 * A scheduled task (14-额度池与任务分工, 定时任务一节): a plan the user or the Bot made, and the
 * record of each time it fired. The client lists plans and the last few results per plan.
 */
export type ScheduleKind = "once" | "daily" | "weekly";
/** `active` runs; `paused` is the user's own stop; `ended` is a one-off that already ran; `missed` is one too old to run. */
export type ScheduleStatus = "active" | "paused" | "ended" | "missed";
/** What one firing did: reported a result, skipped it, failed, or was missed entirely. */
export type ScheduleRunResult = "reported" | "skipped" | "failed" | "missed";
/**
 * `task` makes the Bot do the work when the time comes. `reminder` sends `message` — the words the
 * user wrote when the plan was made — as a Bot message, with no model call and no charge.
 */
export type ScheduleAction = "task" | "reminder";

export interface ScheduleRun {
	id: string;
	/** The due time this firing was for. */
	scheduledFor: string;
	/** When the work actually began; the gap to `scheduledFor` is how long it waited in the queue. */
	startedAt: string | null;
	/** `null` while the run is still going. */
	result: ScheduleRunResult | null;
	/** The real reason for a skip or a failure; never a stand-in for a result. */
	reason: string | null;
}

export interface Schedule {
	id: string;
	conversationId: string;
	title: string;
	archived?: boolean;
	instruction: string;
	action: ScheduleAction;
	/** The exact words a reminder sends; `null` for a task. */
	message: string | null;
	kind: ScheduleKind;
	/** An ISO instant for `once`; `HH:mm` or `HH:mm:ss` local wall time for `daily` and `weekly`; plans fire to the second. */
	at: string;
	/** ISO weekdays (1 = Monday … 7 = Sunday); empty unless `kind` is `weekly`. */
	weekdays: number[];
	timezone: string;
	status: ScheduleStatus;
	nextRunAt: string | null;
	lastRunAt: string | null;
	lastResult: ScheduleRunResult | null;
	createdBy: "user" | "bot";
	/** The last few firings, newest first. */
	recentRuns: ScheduleRun[];
	createdAt: string;
	version: number;
}

export interface ScheduleListResponse {
	items: Schedule[];
}

export interface CreateScheduleRequest {
	title: string;
	/** What the Bot does at the time; a reminder uses `message` instead and may omit this. */
	instruction?: string;
	/** `task` when omitted. */
	action?: ScheduleAction;
	/** The words to send, required for a reminder and refused for a task. */
	message?: string;
	kind: ScheduleKind;
	/** An ISO instant for `once`, `HH:mm` or `HH:mm:ss` for `daily` and `weekly`. */
	at: string;
	weekdays?: number[];
	/** IANA zone; `Asia/Shanghai` when omitted. */
	timezone?: string;
	/** Where the result belongs; the account's primary conversation when omitted. */
	conversationId?: string;
}

export interface UpdateScheduleRequest {
	title?: string;
	instruction?: string;
	action?: ScheduleAction;
	message?: string;
	kind?: ScheduleKind;
	at?: string;
	weekdays?: number[];
	timezone?: string;
	/** A client sends the version it read, so a concurrent edit is refused rather than overwritten. */
	expectedVersion?: number;
}
