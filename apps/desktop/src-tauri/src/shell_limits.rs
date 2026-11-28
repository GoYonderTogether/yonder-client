//! Where the terminal runner keeps its numbers, and the constraint each one protects.
//!
//! Every constant here is a device-side backstop, not a product limit: the server's own bounds and
//! the tool schema stay as they are. The reasoning is repeated in
//! `docs/specs/connectors/terminal.md`, so a reviewer can check a number against what it protects
//! instead of guessing why it exists (TOOLS-V3 §4 leaves concurrency and retention to the device).

/// How long a foreground `shell` waits before handing the command back as a job, 15 s.
///
/// The same number as the old harness (`9d5b09f2^`, `runtime/background.ts`). It is timed on the
/// device so the server never has to hold a request open, and it is what makes `timeoutMs` optional:
/// a command that runs long is not an error, it is a job.
pub const SHELL_FOREGROUND_MS: u64 = 15_000;

/// The same wait for `shell_job` `wait`. The tool's own words are "wait at most another 15 s".
pub const SHELL_WAIT_MS: u64 = SHELL_FOREGROUND_MS;

/// Bytes one result hands back to the model: the first 16 KiB and the last 48 KiB.
///
/// 64 KiB is the size of one local-file `read` page; a command's output should cost a model no more
/// than one page of a file it opened. The split favours the tail because a failing command explains
/// itself at the end; the head keeps the command's own preamble (tool versions, warnings). A cut
/// never splits a UTF-8 character. The full log stays on disk for `read`.
pub const SHELL_OUTPUT_BYTES: usize = 65_536;
pub const SHELL_OUTPUT_HEAD_BYTES: usize = 16 * 1024;

/// Bytes of the finished job's log put into the completion event, 16 KiB.
///
/// An event is a message the Bot reads while it may be busy with something else; the tail is what
/// says whether the build passed. 16 KiB is a quarter of a tool result's 64 KiB, and the Bot can
/// still `shell_job log` for more.
pub const SHELL_EVENT_TAIL_BYTES: usize = 16 * 1024;

/// Commands one device runs at once, across every connection, 4.
///
/// Four covers the real use of this tool on a laptop: a build, a test run, a dev server and one
/// interactive command. More than that competes for the same CPU the user is working on, and the
/// old harness backgrounded rather than queued for the same reason. A refused fifth command gets a
/// plain error the Bot can report, never a silent wait.
pub const SHELL_MAX_RUNNING: usize = 4;

/// Jobs kept in `jobs.json` after they finish, 50.
///
/// Enough to look back through a session's worth of work; the server's `list` shows them all. Each
/// finished job's log is removed when it leaves this window, so retention has to be finite. The
/// bound is the record count, not bytes: a job's log can be any size the user's disk allows, and
/// deleting logs of work that is still "done" would lose the only copy of its output.
pub const SHELL_MAX_FINISHED_JOBS: usize = 50;

/// How long the restart check gives a killed process's wrapper to land its `.exit` file before it
/// calls the job lost.
///
/// A process that ended with the client dying can still be mid-write when the next start reads. This
/// is one read retry, not a wait for work (the check also sleeps this long once before deciding).
pub const SHELL_EXIT_GRACE_MS: u64 = 100;

/// Longest command line accepted, in bytes: the old harness capped a command at 32 K characters, and
/// a command is a tool argument the server already bounds.
pub const SHELL_COMMAND_BYTES: usize = 32_768;

/// Longest `workdir` accepted, in bytes, matching the device-path bound file tools use.
pub const SHELL_WORKDIR_BYTES: usize = 4_096;

/// Largest `stdin` write accepted in one `shell_job write`: the same 64 KiB one tool input may carry.
pub const SHELL_STDIN_BYTES: usize = SHELL_OUTPUT_BYTES;

/// Largest `shell_job log` page, in bytes: one result's worth, like a file read page.
pub const SHELL_LOG_BYTES: usize = SHELL_OUTPUT_BYTES;

/// A hard `timeoutMs` is clamped here. Above one hour a command is a daemon the user did not ask the
/// Bot to watch, and the tool has `kill` for the ones that run forever.
pub const SHELL_TIMEOUT_MAX_MS: u64 = 60 * 60 * 1000;

/// How long an elevated command's **administrator prompt** may stay unanswered before it becomes
/// `elevation_timeout`, two minutes.
///
/// This is not the command's runtime and not the 15 s foreground window: it starts when the device
/// raises the system prompt and ends when the owner approves (the elevated wrapper then writes its
/// `elevated.started` marker) or the window passes. Two minutes is enough for someone to walk back to
/// the computer and type a password, and short enough that a Bot that ignored the "the owner must be
/// at the computer" rule fails with a clear code instead of hanging until the server's own backstop.
/// A command that has already started is never limited by this — only the prompt is.
pub const SHELL_ELEVATION_PROMPT_MS: u64 = 2 * 60 * 1000;

/// Longest `justification` accepted by the device, in characters, the same 300 the server bound.
///
/// It is a sentence the owner reads, not a note; the device refuses one the server would have refused
/// so a hand-built command cannot carry a justification no dialog could show.
pub const SHELL_JUSTIFICATION_CHARS: usize = 300;
