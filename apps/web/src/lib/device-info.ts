import type { DeviceInfo } from "@yonder/protocol";
import type { Storage } from "@yonder/ui-data";
import { deviceTimeZone } from "@yonder/ui-time";
import { createContext, useContext, useMemo } from "react";
import { isTauri } from "./keychain.ts";

export const SystemDeviceName = createContext<string | null>(null);

export async function loadSystemDeviceName(): Promise<string | null> {
	if (!isTauri()) return null;
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		return await invoke<string | null>("plugin:yonder-device-info|system_name");
	} catch {
		return null;
	}
}

export function useDeviceInfo(storage: Storage, appVersion: string) {
	const systemName = useContext(SystemDeviceName);
	return useMemo(() => deviceInfo(storage, appVersion, systemName), [storage, appVersion, systemName]);
}

/** This device's own zone and system language, as the device report carries them. */
function devicePreferences(): { timezone: string; locale: "zh-CN" | "en" } {
	const zone = deviceTimeZone();
	const language = globalThis.navigator?.language ?? "en";
	return { timezone: zone, locale: /^zh\b|^zh-/iu.test(language) ? "zh-CN" : "en" };
}

export function deviceInfo(
	storage: Storage,
	appVersion: string,
	systemName?: string | null,
): DeviceInfo & { installationId: string } {
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
	const native = isTauri();
	const name = native && typeof systemName === "string" ? systemName.trim() : "";
	return {
		installationId,
		name: name && name.length <= 128 ? name : names[os],
		platform: native ? os : "web",
		appVersion,
		// The device's own zone and language travel with the device, so a brand-new account starts
		// in its owner's real zone rather than the server's (migration 127). A `manual` account
		// ignores them for its effective value and only keeps the hint.
		...devicePreferences(),
	};
}
