import { isNativeIosNotifications } from "./native-notifications.ts";

type Place = { latitude: number; longitude: number };
let attempt = 0;
const available = () => {
	if (!isNativeIosNotifications()) throw new Error("unsupported");
};

async function call<T>(
	name: "prepare_place_reminder" | "schedule_place_reminder" | "place_reminder_pending" | "cancel_place_reminder",
	args?: Record<string, unknown>,
): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(`plugin:yonder-notifications|${name}`, args);
}

/** Call only from an explicit reminder action after the user has selected a place. */
export async function scheduleIosPlaceReminder(place: Place, locale: "zh-CN" | "en"): Promise<void> {
	available();
	const { latitude, longitude } = place;
	if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180)
		throw new Error("invalid_place");
	const current = ++attempt;
	await call<void>("prepare_place_reminder");
	if (current !== attempt) throw new Error("interrupted");
	await call<void>("schedule_place_reminder", { latitude, longitude, chinese: locale === "zh-CN" });
}

/** Pending does not mean a reminder has fired or guarantee that it will. */
export async function iosPlaceReminderPending(): Promise<boolean> {
	return isNativeIosNotifications() && (await call<boolean>("place_reminder_pending"));
}

export async function cancelIosPlaceReminder(): Promise<void> {
	available();
	attempt++;
	await call<void>("cancel_place_reminder");
}
