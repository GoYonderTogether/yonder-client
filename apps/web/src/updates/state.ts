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
	error?: "check" | "download" | "install";
}

export function createUpdater(driver: UpdateDriver) {
	let state: UpdateState = { status: "idle" };
	let candidate: UpdateCandidate | null = null;
	const listeners = new Set<() => void>();
	const set = (next: UpdateState) => {
		state = next;
		for (const listener of listeners) listener();
	};
	const info = () => (candidate ? { version: candidate.version, required: candidate.required } : {});
	const busy = () => ["checking", "downloading", "installing"].includes(state.status);
	const progress = (downloaded: number, total: number) => {
		set({
			status: "downloading",
			...info(),
			...(total > 0 ? { progress: Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100))) } : {}),
		});
	};

	async function check() {
		if (busy()) return;
		const old = candidate;
		const previous = state;
		set({ status: "checking" });
		let next: UpdateCandidate | null;
		try {
			next = await driver.check();
		} catch {
			// A failed periodic check must not discard an already downloaded update.
			set(old && previous.status === "ready" ? previous : { status: "error", error: "check" });
			return;
		}
		if (old && previous.status === "ready" && next?.version === old.version) {
			await next.close?.().catch(() => undefined);
			set(previous);
			return;
		}
		await old?.close?.().catch(() => undefined);
		candidate = next;
		if (!candidate) {
			set({ status: "upToDate" });
			return;
		}
		if (driver.platform === "android") {
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

	async function install() {
		if (!candidate || busy()) return;
		if (driver.platform === "desktop") {
			if (state.status !== "ready" && !(state.status === "error" && state.error === "install")) return;
			set({ status: "installing", ...info() });
			try {
				await candidate.install?.();
			} catch {
				set({ status: "error", error: "install", ...info() });
			}
		} else {
			set({ status: "downloading", ...info() });
			try {
				await candidate.download(progress);
				set({ status: "installerOpened", ...info() });
			} catch {
				set({ status: "error", error: "download", ...info() });
			}
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
