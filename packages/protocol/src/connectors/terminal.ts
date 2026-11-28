// Terminal (`computer-control`'s `terminal` capability) result shapes (TOOLS-V3 §4).
//
// Kept in their own module so the connector contract stays readable; `connectors.ts` re-exports
// everything here, so `@yonder/protocol` exposes it unchanged.

/** What `computer_shell_job` asks of one background job (TOOLS-V3 §4). */
export type ShellJobAction = "list" | "status" | "log" | "wait" | "write" | "kill";

/** One background job as `list`, `status` and `wait` report it. */
export interface ShellJobSummary {
	jobId: string;
	/** The first few words of the command, for a human scanning the list. */
	name: string;
	status: "running" | "done" | "killed" | "lost";
	/** Milliseconds since the process started. */
	elapsedMs: number;
	/** Present once the process has exited with a known code. */
	exitCode?: number | null;
	logPath: string;
}

export type TerminalConnectorResult =
	| {
			kind: "shell";
			/** `running` means the foreground window ran out: the process continues as `jobId`. */
			status: "done" | "running";
			/** Exited: its exit code, or null when a signal ended it. Absent while running. */
			exitCode?: number | null;
			/** At most 65536 bytes: the first 16 KiB and the last 48 KiB, cut at a character boundary. */
			output: string;
			/** True when the log holds more than `output`. Read it through `outputPath`. */
			truncated: boolean;
			/** The full log; `read` pages through it. */
			outputPath: string;
			/** Present when `status` is `running`. */
			jobId?: string;
	  }
	| {
			kind: "shell_job";
			jobs?: ShellJobSummary[];
			output?: string;
			/** The absolute offset `output` starts at. */
			offset?: number;
			/** The offset to pass next; below `offset` means that start was already discarded. */
			next?: number;
			truncated?: boolean;
			running?: boolean;
			exitCode?: number | null;
	  };
