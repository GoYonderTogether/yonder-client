import { isTauri } from "./keychain.ts";

export interface NativeNotificationTarget {
	notificationId: string;
	conversationId: string;
	messageId: string;
	recipientMemberId?: string;
}

export interface NativePushRegistration {
	provider: "apns" | "fcm";
	token: string;
	environment?: "sandbox" | "production";
}

const plugin = "yonder-notifications";
const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

export function isNativeIosNotifications(): boolean {
	return (
		isTauri() &&
		(/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
			(/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
	);
}

export function isNativeMobileNotifications(): boolean {
	return isNativeIosNotifications() || (isTauri() && isAndroid());
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(`plugin:${plugin}|${name}`, args);
}

export async function requestNativeNotificationPermission(): Promise<boolean> {
	return isTauri() && (await command<boolean>("request_permission"));
}

export async function nativeNotificationPermission(): Promise<"granted" | "denied" | "default"> {
	return isTauri() ? command("permission_status") : "default";
}

export async function openIosNotificationSettings(): Promise<boolean> {
	return isNativeIosNotifications() && (await command<boolean>("open_settings"));
}

export async function nativePushRegistration(): Promise<NativePushRegistration | null> {
	return isNativeMobileNotifications() ? command("push_registration") : null;
}

async function listen<T>(event: string, callback: (payload: T) => void): Promise<() => void> {
	if (isAndroid()) {
		const { Channel, invoke } = await import("@tauri-apps/api/core");
		const handler = new Channel(callback);
		await invoke(`plugin:${plugin}|registerListener`, { event, handler });
		return () =>
			void invoke(`plugin:${plugin}|removeListener`, { event, channelId: handler.id }).catch(() => undefined);
	}
	const { listen: listenEvent } = await import("@tauri-apps/api/event");
	return listenEvent<T>(`yonder-notification-${event}`, ({ payload }) => callback(payload));
}

export async function listenNativeNotificationOpen(
	callback: (target: NativeNotificationTarget) => void,
): Promise<() => void> {
	if (!isTauri()) return () => undefined;
	let active = true;
	async function takeOpen() {
		const target = await command<NativeNotificationTarget | null>("take_open");
		if (active && target) callback(target);
	}
	const unlisten = await listen("open", () => void takeOpen().catch(() => undefined));
	void takeOpen().catch(() => undefined);
	return () => {
		active = false;
		unlisten();
	};
}

export async function listenNativePushRegistration(
	callback: (registration: NativePushRegistration) => void,
): Promise<() => void> {
	return isNativeMobileNotifications() ? listen("token", callback) : () => undefined;
}

export async function showDesktopNotification({
	title,
	body,
	...target
}: NativeNotificationTarget & { title: string; body: string }): Promise<boolean> {
	if (!isTauri() || isNativeMobileNotifications()) return false;
	return command("show_desktop", { title, body, target });
}
