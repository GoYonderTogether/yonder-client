//! Every numeric boundary the local file tools enforce, with the constraint each one protects.
//!
//! These are device-side backstops, not product limits: the server's own bounds (65,536-byte
//! inputs, 200 results, a 512 KiB receipt) stay as they are, and this file only makes sure a device
//! cannot be talked into spending more time, memory or disk than the command's lifetime allows. The
//! reasoning for each value is also written into `docs/specs/connectors/local-files.md` (server
//! repository), so a reviewer can check the number against the measured constraint.

/// The largest file `edit` will open, 32 MiB.
///
/// A bounded input and output for edit's in-memory splice. `read` streams and has no size cap: it
/// holds one page and one chunk, and the whole-file hash is computed as it goes.
/// This is a resource ceiling, not a promise that a slow volume meets a latency target.
pub const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;

/// One page of `read` returns at most this much text: a tool result must not eat a whole turn.
pub const MAX_PAGE_BYTES: usize = 65_536;

/// The same bound on one input value (`content`, `oldString`, `newString`), matching the server.
pub const MAX_INPUT_BYTES: usize = 65_536;

/// `read` line parameters. The page byte cap is what usually binds first.
pub const MAX_READ_LINES: usize = 2_000;
pub const MAX_OFFSET: usize = 1_000_000;

/// Bytes `read` and `grep` inspect at the start of a file to decide it is binary.
/// It is also the chunk size they read in, so detection costs no extra I/O.
pub const SNIFF_BYTES: usize = 65_536;

/// A scan (`search`, `index`, `grep`) stops after this much wall-clock work, at the latest.
///
/// A bounded allowance for scans that do not encounter a result or visit limit.
pub const SCAN_DEADLINE_MS: u64 = 15_000;

/// Time held back from the command expiry for sending the result back.
pub const SCAN_RECEIPT_MARGIN_MS: u64 = 2_000;

/// Upper bound on metadata and ignore-rule work in a pathological directory tree.
pub const SCAN_VISITS: u64 = 100_000;

/// Directories one breadth-first scan may hold queued. Bounds the queue even when a single level is
/// huge: 10,000 paths of typical length is ~1 MB, and the hard worst case (4,096-byte device paths)
/// is 40 MB.
pub const SCAN_QUEUE: usize = 10_000;

/// Results one scan returns, unchanged: it is the size of the receipt, not of the work.
pub const SCAN_RESULTS: usize = 200;

/// `grep` parameters.
pub const GREP_LIMIT_MAX: usize = 200;
pub const GREP_LIMIT_DEFAULT: usize = 100;
/// Characters kept per matching line, counted around the hit.
pub const GREP_TEXT_CHARS: usize = 300;
/// Characters a user may put before the hit and still see it inside the window.
pub const GREP_TEXT_LEAD: usize = 100;

/// Bytes a long-line window keeps from the one before it, so a hit that straddles the boundary is
/// still found. It is 4 KiB because a pattern is at most 500 characters (`PATTERN_CHARS`), and a
/// match longer than the overlap that straddles a boundary can be missed. There is no per-file size
/// cap any more: the 256 MiB per-command read budget (`GREP_SCAN_BYTES`) is what bounds the work.
pub const GREP_WINDOW_OVERLAP: usize = 4 * 1024;

/// The window a line is matched in: a line longer than this is matched piece by piece, never
/// skipped, so memory holds one window however long the line is.
pub const GREP_LINE_BYTES: usize = 64 * 1024;

/// Bytes of file content `grep` reads in one command, across all files. The intent is that a big
/// grep stops with `stopReason: "budget"` instead of filling the disk queue.
pub const GREP_SCAN_BYTES: u64 = 256 * 1024 * 1024;

/// Total size of match payload (`path` + `text` + per-match overhead) one `grep` returns. The
/// server rejects a receipt over 512 KiB, and 200 device paths of up to 4,096 characters plus a
/// 300-character line can approach that on its own, so the device caps its own payload first.
pub const GREP_PAYLOAD_BYTES: usize = 128 * 1024;

/// Bytes charged per match against [`GREP_PAYLOAD_BYTES`] before its path and text.
pub const GREP_MATCH_OVERHEAD: usize = 32;

/// The regex pattern: characters accepted from the caller, and the compiled program's cap.
pub const PATTERN_CHARS: usize = 500;
pub const REGEX_SIZE_BYTES: usize = 1 << 20;
