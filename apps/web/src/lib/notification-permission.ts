/**
 * Turning notifications on, per platform (docs/notifications.md 第二节).
 *
 * The one thing that was missing: nothing ever asked for the system permission, so a new install
 * never received a push. This module is that ask, and the subscription that follows it.
 *
 * - iOS / Android shell: the native permission, then the APNs or FCM token.
 * - macOS / Windows shell: the native permission; the app presents its own banners.
 * - Browser: `Notification.requestPermission`, then a Web Push subscription.
 */
import type { PushTokenRegistration } from "@yonder/protocol";
import { isTauri } from "./keychain.ts";
import {
	isNativeMobileNotifications,
	nativeNotificationPermission,
	nativePushRegistration,
	requestNativeNotificationPermission,
} from "./native-notifications.ts";
import {
	browserNotificationPermission,
	listenWebPushOpen,
	requestBrowserNotificationPermission,
	subscribeWebPush,
	unsubscribeWebPush,
	webPushSupported,
} from "./web-push.ts";

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

/** What the settings screen shows for this installation. */
export async function notificationPermissionState(): Promise<NotificationPermissionState> {
	if (isTauri()) {
		const status = await nativeNotificationPermission().catch(() => "default" as const);
		return status;
	}
	if (!webPushSupported()) return "unsupported";
	return browserNotificationPermission();
}

export interface NotificationEnableResult {
	state: NotificationPermissionState;
	/** What to register with the server; null when this platform needs no token (desktop) or failed. */
	registration: PushTokenRegistration | null;
}

/**
 * Ask for permission and produce the registration the server needs. Must be called from a direct
 * gesture on browsers: the permission prompt is refused otherwise.
 */
export async function enableNotifications(publicKey: () => Promise<string | null>): Promise<NotificationEnableResult> {
	if (isTauri()) {
		const granted = await requestNativeNotificationPermission().catch(() => false);
		if (!granted) return { state: (await notificationPermissionState()) ?? "denied", registration: null };
		if (!isNativeMobileNotifications()) return { state: "granted", registration: null };
		const registration = await nativePushRegistration().catch(() => null);
		return { state: "granted", registration };
	}
	const permission = await requestBrowserNotificationPermission();
	if (permission !== "granted") return { state: permission, registration: null };
	const key = await publicKey().catch(() => null);
	if (!key) return { state: "granted", registration: null };
	const registration = await subscribeWebPush(key).catch(() => null);
	return { state: "granted", registration };
}

/** Turning notifications off: drop the browser's subscription; the server row goes with it. */
export async function disableNotifications(): Promise<void> {
	if (!isTauri()) await unsubscribeWebPush();
}

/** A tap on a pushed notification opens the conversation it names. */
export function listenWebPushNotificationOpen(onOpen: (conversationId: string) => void): () => void {
	return isTauri() ? () => {} : listenWebPushOpen(onOpen);
}
