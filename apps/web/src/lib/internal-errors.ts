import { ApiError, NetworkError } from "@yonder/api-client";
import { isTauri } from "./keychain.ts";

const PATH = "/v1/internal/error-reports";
const STORAGE_PREFIX = "yonder:internal-errors:";
const MAX_BUCKETS = 8;
const MAX_COUNT = 100;

type ErrorBucket =
	| { action: "navigation"; phase: "render"; reason: "boundary_failure"; duration: "unknown" }
	| {
			action: "provider_add";
			phase: "save" | "discover";
			reason: "api_4xx" | "api_5xx" | "network" | "timeout" | "unexpected";
			duration: "under_1s" | "under_5s" | "at_least_5s";
	  };

const queue = new Map<string, ErrorBucket & { count: number }>();
let timer: ReturnType<typeof setTimeout> | undefined;
let sending: AbortController | undefined;

function pilotBuild() {
	const build = import.meta.env.VITE_INTERNAL_ERROR_BUILD;
	if (!build || !/^pilot-[0-9]{2}$/.test(build) || import.meta.env.VITE_API_BASE) return;
	const stage = import.meta.env.VITE_INTERNAL_ERROR_ORIGIN;
	if (stage) {
		// The relative reporting route cannot leave the dedicated private staging origin.
		if (!isTauri() && window.location.protocol === "https:" && window.location.origin === stage) return build;
		return;
	}
	if (
		import.meta.env.DEV &&
		__YONDER_PILOT_API_LOCAL__ &&
		window.location.protocol === "http:" &&
		["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
	)
		return build;
}

export function internalErrorPilot(): boolean {
	return pilotBuild() !== undefined;
}

export function internalErrorConsent(): boolean {
	try {
		const build = pilotBuild();
		return build !== undefined && localStorage.getItem(STORAGE_PREFIX + build) === "1";
	} catch {
		return false;
	}
}

export function setInternalErrorConsent(enabled: boolean): boolean {
	if (!enabled) {
		clearTimeout(timer);
		timer = undefined;
		queue.clear();
		sending?.abort();
	}
	try {
		const build = pilotBuild();
		if (!build) return false;
		if (enabled) localStorage.setItem(STORAGE_PREFIX + build, "1");
		else localStorage.removeItem(STORAGE_PREFIX + build);
		return true;
	} catch {
		return false;
	}
}

function platform() {
	if (!isTauri()) return "web";
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
	if (/Android/i.test(ua)) return "android";
	if (/Windows/i.test(ua)) return "windows";
	return /Macintosh|Mac OS X/i.test(ua) ? "macos" : "web";
}

function schedule() {
	if (!timer && !sending && queue.size > 0) timer = setTimeout(flush, 1000);
}

async function flush(): Promise<void> {
	timer = undefined;
	const build = pilotBuild();
	const errors = [...queue.values()];
	queue.clear();
	if (!build || !internalErrorConsent() || errors.length === 0) return;
	const request = new AbortController();
	sending = request;
	const deadline = setTimeout(() => request.abort(), 5000);
	try {
		await fetch(PATH, {
			method: "POST",
			credentials: "omit",
			cache: "no-store",
			redirect: "error",
			referrerPolicy: "no-referrer",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ version: 1, build, platform: platform(), errors }),
			signal: request.signal,
		});
	} catch {
		// Best effort: no retries, disk spool, logging, UI errors or recursive reporting.
	} finally {
		clearTimeout(deadline);
		sending = undefined;
		schedule();
	}
}

function enqueue(event: ErrorBucket) {
	if (!internalErrorConsent()) return;
	const key = `${event.action}:${event.phase}:${event.reason}:${event.duration}`;
	const previous = queue.get(key);
	if (!previous && queue.size >= MAX_BUCKETS) return;
	queue.set(key, { ...event, count: Math.min(MAX_COUNT, (previous?.count ?? 0) + 1) });
	schedule();
}

export function reportNavigationFailure(): void {
	enqueue({ action: "navigation", phase: "render", reason: "boundary_failure", duration: "unknown" });
}

export function reportProviderAddFailure(phase: "save" | "discover", error: unknown, startedAt: number): void {
	if (error instanceof DOMException && error.name === "AbortError") return;
	const reason =
		error instanceof ApiError && error.status >= 400 && error.status < 600
			? error.status >= 500
				? "api_5xx"
				: "api_4xx"
			: error instanceof NetworkError
				? "network"
				: error instanceof DOMException && error.name === "TimeoutError"
					? "timeout"
					: "unexpected";
	const elapsed = performance.now() - startedAt;
	const duration = elapsed < 1000 ? "under_1s" : elapsed < 5000 ? "under_5s" : "at_least_5s";
	enqueue({ action: "provider_add", phase, reason, duration });
}
