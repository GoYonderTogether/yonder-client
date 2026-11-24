import { isNativeIosNotifications } from "./native-notifications.ts";

export type IosLocationFix = {
	latitude: number;
	longitude: number;
	horizontalAccuracyMeters: number;
	/** Acquisition time from Core Location, not the time returned over IPC. */
	acquiredAtMs: number;
	approximate: boolean;
};

async function call(name: "prepare_location" | "current_location"): Promise<unknown> {
	if (!isNativeIosNotifications()) throw new Error("unsupported");
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke(`plugin:yonder-notifications|${name}`);
}

/** Requests When In Use access; call only after an explicit user action. */
export async function prepareIosLocation(): Promise<void> {
	await call("prepare_location");
}

/** Local foreground one-shot; never prompts, saves, or uploads. */
export async function readCurrentIosLocation(): Promise<IosLocationFix> {
	const fix = (await call("current_location")) as Partial<IosLocationFix> | null;
	if (!fix || typeof fix !== "object") throw new Error("location_unavailable");
	const { latitude, longitude, horizontalAccuracyMeters, acquiredAtMs, approximate } = fix;
	if (
		typeof latitude !== "number" ||
		!Number.isFinite(latitude) ||
		Math.abs(latitude) > 90 ||
		typeof longitude !== "number" ||
		!Number.isFinite(longitude) ||
		Math.abs(longitude) > 180 ||
		typeof horizontalAccuracyMeters !== "number" ||
		!Number.isFinite(horizontalAccuracyMeters) ||
		horizontalAccuracyMeters < 0 ||
		typeof acquiredAtMs !== "number" ||
		!Number.isSafeInteger(acquiredAtMs) ||
		acquiredAtMs <= 0 ||
		acquiredAtMs > 8.64e15 ||
		typeof approximate !== "boolean"
	) {
		throw new Error("location_unavailable");
	}
	return { latitude, longitude, horizontalAccuracyMeters, acquiredAtMs, approximate };
}
