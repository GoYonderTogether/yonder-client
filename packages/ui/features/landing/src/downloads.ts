import type { DownloadPlatform } from "./environment.ts";

export interface DownloadEntry {
	platform: DownloadPlatform;
	version: string | null;
	url: string | null;
}

export function createDownloadCatalog(
	version: string,
	options: { iosUrl?: string } = {},
): Record<DownloadPlatform, DownloadEntry> {
	const publicBase = "https://dl.zethai.cn";
	const desktop = `${publicBase}/desktop/${version}/Yonder_${version}`;
	return {
		macos: { platform: "macos", version, url: `${desktop}_aarch64.dmg` },
		windows: { platform: "windows", version, url: `${desktop}_x64-setup.exe` },
		android: { platform: "android", version: null, url: `${publicBase}/android/yonder-android.apk` },
		ios: { platform: "ios", version: null, url: options.iosUrl?.trim() || null },
		web: { platform: "web", version, url: "/messages" },
	};
}
