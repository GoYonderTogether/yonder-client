import { BUILD_VERSION, NATIVE_BUILD_CHANNEL } from "../lib/config.ts";
import { isTauri } from "../lib/keychain.ts";
import type { UpdateCandidate, UpdateDriver, UpdatePlatform } from "./state.ts";
import type { UpdateOffer } from "./update-offer.ts";
import { compareVersions } from "./version.ts";

export function updatePlatform(): UpdatePlatform | null {
	if (!isTauri() || typeof navigator === "undefined") return null;
	const ua = navigator.userAgent;
	if (/Android/i.test(ua)) return "android";
	if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return null;
	return /Macintosh|Mac OS X|Windows/i.test(ua) ? "desktop" : null;
}

type ReadOffer = () => Promise<UpdateOffer | null>;

export function updateDriver(platform: UpdatePlatform, readOffer?: ReadOffer): UpdateDriver {
	return {
		platform,
		async check() {
			const offer = readOffer ? await readOffer() : null;
			if (readOffer && !offer?.manifest) return null;
			const candidate = await (platform === "desktop" ? checkDesktop(offer) : checkAndroid(offer));
			if (!candidate || !offer || !readOffer) return candidate;
			if (candidate.version !== offer.version) {
				await candidate.close?.();
				throw new Error("Update version changed");
			}
			return {
				...candidate,
				async install() {
					if ((await readOffer())?.id !== offer.id) throw new Error("Update is no longer available");
					await candidate.install?.();
				},
			};
		},
	};
}

async function checkDesktop(offer: UpdateOffer | null): Promise<UpdateCandidate | null> {
	const updater = await import("@tauri-apps/plugin-updater");
	let update: Awaited<ReturnType<typeof updater.check>>;
	if (offer?.manifest) {
		const { invoke } = await import("@tauri-apps/api/core");
		const metadata = await invoke<ConstructorParameters<typeof updater.Update>[0] | null>("restore_channel_update", {
			manifest: offer.manifest,
			expectedVersion: offer.version,
			returningToStable: NATIVE_BUILD_CHANNEL === "beta" && offer.channel === "stable",
		});
		update = metadata ? new updater.Update(metadata) : null;
	} else {
		update = await updater.check();
	}
	if (!update) return null;
	let downloaded = 0;
	let total = 0;
	let installed = false;
	return {
		version: update.version,
		required: false,
		async download(progress) {
			await update.download((event) => {
				if (event.event === "Started") total = event.data.contentLength ?? 0;
				if (event.event === "Progress") downloaded += event.data.chunkLength;
				progress(downloaded, total);
			});
		},
		async install() {
			// Save the recording so the user can continue it after restarting.
			const { invokeMeetingRecorder } = await import("../lib/meeting-recorder.ts");
			await invokeMeetingRecorder("interrupt_for_restart", {}).catch(() => undefined);
			if (!installed) {
				await update.install();
				installed = true;
			}
			const { relaunch } = await import("@tauri-apps/plugin-process");
			await relaunch();
		},
		close: () => update.close(),
	};
}

interface AndroidManifest {
	version: string;
	versionCode: number;
	url: string;
	sha256: string;
	minSupportedVersion?: string;
}

export function parseAndroidManifest(value: unknown): AndroidManifest {
	if (!value || typeof value !== "object") throw new Error("Invalid release");
	const data = value as Record<string, unknown>;
	if (
		typeof data.version !== "string" ||
		!Number.isSafeInteger(data.versionCode) ||
		(data.versionCode as number) < 1 ||
		typeof data.url !== "string" ||
		typeof data.sha256 !== "string" ||
		!/^[a-f\d]{64}$/i.test(data.sha256) ||
		(data.minSupportedVersion != null && typeof data.minSupportedVersion !== "string")
	)
		throw new Error("Invalid release");
	const url = new URL(data.url);
	if (url.protocol !== "https:" || url.hostname !== "dl.zethai.cn" || url.username || url.password) {
		throw new Error("Invalid release URL");
	}
	compareVersions(data.version, data.version);
	if (typeof data.minSupportedVersion === "string") compareVersions(data.minSupportedVersion, data.minSupportedVersion);
	return {
		version: data.version,
		versionCode: data.versionCode as number,
		url: data.url,
		sha256: data.sha256,
		...(typeof data.minSupportedVersion === "string" ? { minSupportedVersion: data.minSupportedVersion } : {}),
	};
}

async function checkAndroid(offer: UpdateOffer | null): Promise<UpdateCandidate | null> {
	const { invoke, Channel } = await import("@tauri-apps/api/core");
	const [current, raw] = await Promise.all([
		invoke<{ versionCode: number }>("plugin:android-update|versionCode"),
		offer?.manifest ?? invoke<unknown>("plugin:android-update|latest"),
	]);
	if (!Number.isSafeInteger(current.versionCode) || current.versionCode < 1)
		throw new Error("Invalid installed version");
	const release = parseAndroidManifest(raw);
	if (release.versionCode <= current.versionCode) return null;
	return {
		version: release.version,
		required: release.minSupportedVersion ? compareVersions(BUILD_VERSION, release.minSupportedVersion) < 0 : false,
		async download(progress) {
			const onProgress = new Channel<{ downloaded: number; total: number }>((event) =>
				progress(event.downloaded, event.total),
			);
			await invoke("plugin:android-update|download", {
				url: release.url,
				sha256: release.sha256,
				onProgress,
			});
		},
		install: () => invoke<void>("plugin:android-update|install", { sha256: release.sha256 }),
	};
}
