//! Every bound the browser-control device side applies, with the reason it exists.
//!
//! The receipt limits are not arbitrary tidiness: the server refuses a `browser_observe` text over
//! 64 KiB, an element list over 400, and a screenshot whose base64 pushes the whole command receipt
//! past its 512 KiB body limit (`packages/platform/connectors/src/browser-results.ts`). A device that
//! sent more would be answered with `invalid_request` instead of a result, so the device cuts first
//! and says `truncated: true` — never silently, and never by losing the whole answer.

use std::time::Duration;

/// The most text one `browser_observe` returns; the same 64 KiB a file-read page carries.
pub const OBSERVE_TEXT_BYTES: usize = 65_536;
/// The most elements one `browser_observe` snapshot lists.
pub const OBSERVE_ELEMENTS: usize = 400;
/// The most raw PNG bytes a screenshot may carry: base64 adds a third (384 KiB encoded), which keeps
/// the whole receipt under the server's 512 KiB.
pub const SCREENSHOT_BYTES: usize = 288 * 1024;
/// The most sessions one `browser_session list` reports; a person does not run more Agent Windows.
pub const SESSIONS: usize = 10;
/// The daemon's own discovery wait is 35 s; a session start must outlast it or we would give up on
/// a start that is about to succeed.
pub const SESSION_START_TIMEOUT: Duration = Duration::from_secs(45);
/// A session stop returns borrowed tabs and can wait for the extension.
pub const SESSION_STOP_TIMEOUT: Duration = Duration::from_secs(20);
/// Listing sessions is a local round trip.
pub const LIST_TIMEOUT: Duration = Duration::from_secs(8);
/// Status and browsers ask the daemon for an immediate snapshot; 8 s covers a slow socket.
pub const STATUS_TIMEOUT: Duration = Duration::from_secs(8);
/// A navigation waits for the document; the CLI is given 45 s and the process is killed at 60 s.
pub const NAVIGATE_TIMEOUT: Duration = Duration::from_secs(60);
/// One observation: the extension walks the tree, which takes seconds on a large page.
pub const OBSERVE_TIMEOUT: Duration = Duration::from_secs(45);
/// One interaction (click, fill, press, select, hover, scroll): a local input dispatch.
pub const ACT_TIMEOUT: Duration = Duration::from_secs(30);
/// A screenshot, full page included: stitching a long page is the slowest thing bsk does.
pub const SCREENSHOT_TIMEOUT: Duration = Duration::from_secs(90);
/// The timeout handed to `bsk navigate` itself, below our own kill deadline.
pub const NAVIGATE_CLI_SECONDS: u32 = 45;
/// The timeout handed to `bsk screenshot` full-page stitching, below our own kill deadline.
pub const SCREENSHOT_CLI_SECONDS: u32 = 75;
/// The daemon start is spawned detached and returns once ready; 12 s covers a cold start.
pub const DAEMON_START_TIMEOUT: Duration = Duration::from_secs(12);