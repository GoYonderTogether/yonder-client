import type { DeviceInfo } from "@yonder/protocol";
import type { Storage } from "@yonder/ui-data";
import { isTauri } from "./keychain.ts";

export function deviceInfo(storage: Storage, appVersion: string): DeviceInfo & { installationId: string } {
	let installationId = storage.get("installation-id");
	if (!installationId) {
		installationId = crypto.randomUUID();
		storage.set("installation-id", installationId);
	}
	const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
	const touchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints;
	const os = /Android/i.test(ua)
		? "android"
		: /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)
			? "ios"
			: /Macintosh|Mac OS X/i.test(ua)
				? "macos"
				: /Windows/i.test(ua)
					? "windows"
					: /Linux/i.test(ua)
						? "linux"
						: "web";
	const names = {
		android: "Android",
		ios: "iPhone / iPad",
		macos: "Mac",
		windows: "Windows PC",
		linux: "Linux",
		web: "Web browser",
	};
	return { installationId, name: names[os], platform: isTauri() ? os : "web", appVersion };
}
