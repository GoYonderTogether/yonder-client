import type { LocalFilesContext } from "./local-files.ts";

/**
 * The terminal's native side, as the runtime sees it: commands go to `shell_execute`, and the
 * completion of a job the client left running arrives as a webview event. Both are thin wrappers
 * so the runtime never imports Tauri directly (it must also load in a browser and in tests).
 */

export async function executeShell<T>(context: LocalFilesContext, command: unknown): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>("shell_execute", { context, command });
}

/**
 * The user stopped a round that had started a command: end the process tree that command left
 * running. A command that already answered `done` has no job, and this is then a no-op.
 */
export async function cancelShell(commandId: string): Promise<void> {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("shell_cancel", { commandId });
}

/** One finished job, shaped for the realtime `shell.job.finished` event the server turns into a notice. */
export interface ShellJobFinished {
	connectionId: string;
	jobId: string;
	command: string;
	status: "done" | "killed" | "lost";
	exitCode?: number | null;
	elapsedMs: number;
	outputTail: string;
}

/** The realtime event the server turns into one `【事件 · 终端】`. */
export type ShellJobFinishedEvent = { type: "shell.job.finished" } & ShellJobFinished;

/**
 * Follow finished jobs. The native watcher sends each one once (`notified` is recorded on disk, so
 * a reconnect or a restart does not send it twice); the runtime forwards it on its own socket.
 */
export async function listenShellJobFinished(onFinished: (event: ShellJobFinishedEvent) => void): Promise<() => void> {
	const { listen } = await import("@tauri-apps/api/event");
	return listen<ShellJobFinished>("shell-job-finished", ({ payload }) =>
		onFinished({ type: "shell.job.finished", ...payload }),
	);
}
