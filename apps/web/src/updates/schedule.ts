/*
 * When to look for a new build. Three signals, each covering a gap the server's socket hint
 * cannot: the first moments after launch (the socket is not open yet), coming back to the app
 * after a while away (the socket is the first thing lost), and a slow floor for an app left
 * open across days.
 *
 * Deliberately not a tight poll: the server watches the release feed and pushes
 * `device.update.available` over the socket, so a check here is the fallback, not the fast path.
 * Repeats are cheap — the updater drops a check while one is already in flight, and a check that
 * finds the same staged version does not download it again.
 */

const STARTUP_DELAY_MS = 5_000;
/** Coming back to the app is the likeliest moment a user can act on an update, and the cheapest. */
const FOREGROUND_THROTTLE_MS = 30 * 60 * 1000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface CheckScheduleOptions {
	startupDelayMs?: number;
	foregroundThrottleMs?: number;
	intervalMs?: number;
	now?: () => number;
	/** Injected so tests need no browser; `null` opts a signal out. */
	visibility?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> | null;
	focus?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

export function scheduleUpdateChecks(check: () => Promise<void>, options: CheckScheduleOptions = {}) {
	const startupDelayMs = options.startupDelayMs ?? STARTUP_DELAY_MS;
	const throttleMs = options.foregroundThrottleMs ?? FOREGROUND_THROTTLE_MS;
	const intervalMs = options.intervalMs ?? INTERVAL_MS;
	const now = options.now ?? Date.now;
	const visibility = options.visibility === undefined ? document : options.visibility;
	const focus = options.focus === undefined ? window : options.focus;
	let stopped = false;
	let lastCheck = 0;

	const run = () => {
		if (stopped) return;
		lastCheck = now();
		check().catch(() => undefined);
	};
	// A raise fires focus and visibilitychange together, and a phone resumes a frozen timer:
	// the throttle keeps either from turning into a burst of checks.
	const foreground = () => {
		if (stopped || (visibility && visibility.visibilityState !== "visible")) return;
		if (now() - lastCheck < throttleMs) return;
		run();
	};

	const startup = setTimeout(run, startupDelayMs);
	const interval = setInterval(run, intervalMs);
	visibility?.addEventListener("visibilitychange", foreground);
	focus?.addEventListener("focus", foreground);

	return {
		lastCheck: () => lastCheck,
		stop() {
			stopped = true;
			clearTimeout(startup);
			clearInterval(interval);
			visibility?.removeEventListener("visibilitychange", foreground);
			focus?.removeEventListener("focus", foreground);
		},
	};
}
