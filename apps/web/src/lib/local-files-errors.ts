/**
 * The error codes the local connector runtime passes through from the device, and the helper that
 * maps an unknown rejection onto one. Its own module so the runtime file stays about the socket and
 * dispatch flow (and under the file-length limit), and so a test can reason about the set alone.
 */

/** Every connector error the device can answer with; anything else becomes `operation_failed`. */
export const CONNECTOR_ERRORS = new Set([
	"permission_denied",
	"not_found",
	"path_invalid",
	"unsupported_file",
	"too_large",
	"disconnected",
	"cancelled",
	"read_failed",
	"conflict",
	"already_exists",
	"operation_failed",
	// A photo whose pixels are only in iCloud, and an asset with no readable local copy: the real
	// states the server and the model need, never collapsed into a generic read failure.
	"icloud_only",
	"unavailable",
	// The terminal's own errors: a killed command, an unreadable log, a job id nothing matches, and
	// a job whose process vanished across a restart. Each is a real state the model is told.
	"timeout",
	"output_unavailable",
	"job_not_found",
	"job_lost",
	// The elevation answers from the device: the owner refused the system prompt, the prompt went
	// unanswered, or this device cannot raise one. Each passes through so the model stops and asks.
	"elevation_denied",
	"elevation_timeout",
	"elevation_unavailable",
	// Desktop control: a missing macOS permission (with which one), a window that closed, or a ref
	// that no longer names an element. Each is a real state the model needs, not a generic failure.
	"desktop_permission_required",
	"window_not_found",
	"element_not_found",
	// Browser control: bsk is not installed, no browser is attached, or the session a call named is
	// gone. Each is passed through so the model tells the owner the right next step (browser.md §5).
	"browser_not_installed",
	"browser_disconnected",
	"browser_session_not_found",
]);

/** A native refusal is the real error code; anything else is a write that did not finish. */
export function grantError(error: unknown): string {
	const code = error instanceof Error ? error.message : String(error);
	return CONNECTOR_ERRORS.has(code) ? code : "operation_failed";
}
