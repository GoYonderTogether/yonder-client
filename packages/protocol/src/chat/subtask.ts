/**
 * A subtask is a child run of a chat run (14-额度池与任务分工, 子任务一节). Its process never enters
 * the conversation; the client sees it through `subtask.updated` events and task notices.
 */
export type SubtaskStatus = "running" | "background" | "paused" | "waiting_user" | "completed" | "failed" | "cancelled";

/** The live view of one subtask, keyed by its run id. */
export interface SubtaskSummary {
	id: string;
	conversationId: string;
	parentRunId: string;
	title: string;
	status: SubtaskStatus;
	createdAt: string;
}
