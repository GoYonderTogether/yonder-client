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
	installIssue?: "permission" | "settingsUnavailable";
}

export function createUpdater(driver: UpdateDriver) {
	let state: UpdateState = { status: "idle" };
	let candidate: UpdateCandidate | null = null;
	let notice = false;
	/**
	 * One check at a time: a trigger that lands during a check waits for it, then runs its own
	 * pass. That second pass is what keeps a stale download from surviving a release that was
	 * published between two triggers.
	 */
	let checkFlight: Promise<void> | undefined;
	let queued = false;
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
	const staged = (value: UpdateState) =>
		value.status === "ready" || value.status === "installerOpened" || value.error === "install";
	const progress = (downloaded: number, total: number) => {
		set({
			status: "downloading",
			...info(),
			...(total > 0 ? { progress: Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100))) } : {}),
		});
	};

	/**
	 * `expectedVersion` must be verified before the button it belongs to installs anything.
	 * `asNotice` means the caller is the update banner. Either is an explicit request for the
	 * newest build, so it waits out a download already in progress and runs again afterwards —
	 * that is what replaces a package that a newer release overtook mid-transfer. A plain
	 * background trigger returns early instead: the running check reads the same feed.
	 */
	async function check(expectedVersion?: string, asNotice = false) {
		if (state.status === "installing") return;
		const explicit = Boolean(expectedVersion) || asNotice;
		if (checkFlight) {
			if (!explicit) return;
			queued = true;
			await checkFlight.catch(() => undefined);
			if (!queued) return;
			queued = false;
		}
		checkFlight = checkAndDownload(expectedVersion, asNotice);
		try {
			await checkFlight;
		} finally {
			checkFlight = undefined;
		}
	}

	async function checkAndDownload(expectedVersion?: string, asNotice = false) {
		const old = candidate;
		const previous = state;
		set({ status: "checking", ...(expectedVersion || asNotice ? { notice: true } : {}) });
		let next: UpdateCandidate | null;
		try {
			next = await driver.check();
		} catch {
			// A failed check must not discard an already downloaded update.
			set(expectedVersion || asNotice || (old && staged(previous)) ? previous : { status: "error", error: "check" });
			return;
		}
		if (expectedVersion && next?.version !== expectedVersion) {
			// The feed moved on since the user was offered this build. Leave the previous offer on
			// screen and let the next pass stage the newer one: installing here would replace the
			// app with a build the visible label does not name.
			await next?.close?.().catch(() => undefined);
			set(previous);
			return;
		}
		// Set by any check made on the banner's behalf and kept until the banner goes away, so the
		// sidebar's quieter control does not appear beside a banner that already says the same.
		notice = Boolean(expectedVersion) || asNotice || notice;
		if (old && staged(previous) && next?.version === old.version) {
			await next.close?.().catch(() => undefined);
			set({ status: "ready", ...info() });
			return;
		}
		// Either nothing was staged, or a newer build replaced one that was: the old candidate is
		// closed and the newer one downloaded now, so "restart to update" always installs the build
		// the screen names.
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

	function readyFor(version: string) {
		return state.version === version && (state.status === "ready" || state.error === "install");
	}

	async function prepare(version: string) {
		if (checkFlight) await checkFlight;
		else if (!readyFor(version)) await check(version);
		return readyFor(version);
	}

	async function install(expectedVersion?: string) {
		// Refuses anything but the build the caller named on screen. Check and download already
		// happened before the confirmation dialog opened, so this compares rather than fetches: a
		// network hiccup must not block a package that is already verified on disk.
		if (!candidate || busy() || (expectedVersion && candidate.version !== expectedVersion)) return false;
		if (!candidate.install) return false;
		if (!staged(state)) {
			if (driver.platform !== "android" || expectedVersion) return false;
			set({ status: "downloading", ...info() });
			try {
				await candidate.download(progress);
			} catch {
				set({ status: "error", error: "download", ...info() });
				return false;
			}
		}
		set({ status: "installing", ...info() });
		try {
			await candidate.install();
			if (driver.platform === "android") set({ status: "installerOpened", ...info() });
			return true;
		} catch (failure) {
			const code =
				driver.platform === "android" && failure && typeof failure === "object" && "code" in failure
					? failure.code
					: undefined;
			const installIssue =
				code === "android_install_permission_required"
					? "permission"
					: code === "android_install_settings_unavailable"
						? "settingsUnavailable"
						: undefined;
			set({ status: "error", error: "install", ...info(), ...(installIssue ? { installIssue } : {}) });
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
		prepare,
		install,
	};
}

export type Updater = ReturnType<typeof createUpdater>;
