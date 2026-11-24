export type UpdatePlatform = "desktop" | "android";
export type UpdateStatus =
	| "idle"
	| "checking"
	| "upToDate"
	| "available"
	| "downloading"
	| "ready"
	| "installing"
	| "installerOpened"
	| "error";

export interface UpdateCandidate {
	version: string;
	required: boolean;
	download: (progress: (downloaded: number, total: number) => void) => Promise<void>;
	install?: () => Promise<void>;
	close?: () => Promise<void>;
}

export interface UpdateDriver {
	platform: UpdatePlatform;
	check: () => Promise<UpdateCandidate | null>;
}

export interface UpdateState {
	status: UpdateStatus;
	version?: string;
	required?: boolean;
	progress?: number;
	notice?: true;
	error?: "check" | "download" | "install";
}

export function createUpdater(driver: UpdateDriver) {
	let state: UpdateState = { status: "idle" };
	let candidate: UpdateCandidate | null = null;
	let notice = false;
	const listeners = new Set<() => void>();
	const set = (next: UpdateState) => {
		state = next;
		for (const listener of listeners) listener();
	};
	const info = () =>
		candidate
			? { version: candidate.version, required: candidate.required, ...(notice ? { notice: true as const } : {}) }
			: {};
	const busy = () => ["checking", "downloading", "installing"].includes(state.status);
	const progress = (downloaded: number, total: number) => {
		set({
			status: "downloading",
			...info(),
			...(total > 0 ? { progress: Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100))) } : {}),
		});
	};

	async function check(expectedVersion?: string) {
		if (busy()) return;
		const old = candidate;
		const previous = state;
		set({ status: "checking", ...(expectedVersion ? { notice: true } : {}) });
		let next: UpdateCandidate | null;
		try {
			next = await driver.check();
		} catch {
			// A failed check must not discard an already downloaded update.
			set(expectedVersion || (old && previous.status === "ready") ? previous : { status: "error", error: "check" });
			return;
		}
		if (expectedVersion && next?.version !== expectedVersion) {
			await next?.close?.().catch(() => undefined);
			set(previous);
			return;
		}
		notice = Boolean(expectedVersion);
		if (old && previous.status === "ready" && next?.version === old.version) {
			await next.close?.().catch(() => undefined);
			set({ status: "ready", ...info() });
			return;
		}
		await old?.close?.().catch(() => undefined);
		candidate = next;
		if (!candidate) {
			set({ status: "upToDate" });
			return;
		}
		if (driver.platform === "android" && !expectedVersion) {
			set({ status: "available", ...info() });
			return;
		}
		set({ status: "downloading", ...info() });
		try {
			await candidate.download(progress);
			set({ status: "ready", ...info() });
		} catch {
			set({ status: "error", error: "download", ...info() });
		}
	}

	async function install(expectedVersion?: string) {
		if (!candidate || busy() || (expectedVersion && candidate.version !== expectedVersion)) return false;
		const ready = state.status === "ready" || state.error === "install";
		if (driver.platform === "desktop" || ready) {
			if (!ready || !candidate.install) return false;
			set({ status: "installing", ...info() });
			try {
				await candidate.install();
				if (driver.platform === "android") set({ status: "installerOpened", ...info() });
				return true;
			} catch {
				set({ status: "error", error: "install", ...info() });
				return false;
			}
		}
		if (expectedVersion) return false;
		set({ status: "downloading", ...info() });
		try {
			await candidate.download(progress);
			await candidate.install?.();
			set({ status: "installerOpened", ...info() });
			return true;
		} catch {
			set({ status: "error", error: "download", ...info() });
			return false;
		}
	}

	return {
		platform: driver.platform,
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		check,
		install,
	};
}

export type Updater = ReturnType<typeof createUpdater>;
