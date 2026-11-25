/**
 * Web Push for the browser app (docs/notifications.md 第二节). A browser gets a push only while the
 * tab is closed or in the background; an open, focused tab already has the message on its socket.
 *
 * The service worker is registered only once the person turns notifications on, so a browser that
 * never opts in downloads nothing extra and keeps no worker running.
 */
import type { PushTokenRegistration } from "@yonder/protocol";

const SCOPE = "/";
const WORKER = "/push-sw.js";

/** Whether this browser can receive Web Push at all (a secure context with the Push API). */
export function webPushSupported(): boolean {
	return (
		typeof window !== "undefined" &&
		window.isSecureContext &&
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

/** Notification.requestPermission, which some browsers only allow from a direct gesture. */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
	if (!("Notification" in window)) return "denied";
	if (Notification.permission !== "default") return Notification.permission;
	return Notification.requestPermission();
}

export function browserNotificationPermission(): NotificationPermission {
	return typeof Notification === "undefined" ? "denied" : Notification.permission;
}

function decodeBase64url(value: string): ArrayBuffer {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes.buffer;
}

async function worker(): Promise<ServiceWorkerRegistration> {
	const existing = await navigator.serviceWorker.getRegistration(SCOPE);
	return existing ?? (await navigator.serviceWorker.register(WORKER, { scope: SCOPE }));
}

/**
 * The browser's subscription, as the server stores it. Returns null when the browser cannot
 * subscribe (no permission, no Push API, or a push service that refused).
 */
export async function subscribeWebPush(publicKey: string): Promise<PushTokenRegistration | null> {
	if (!webPushSupported() || Notification.permission !== "granted") return null;
	const registration = await worker();
	await navigator.serviceWorker.ready;
	const existing = await registration.pushManager.getSubscription();
	const subscription =
		existing ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: decodeBase64url(publicKey),
		}));
	const json = subscription.toJSON();
	const p256dh = json.keys?.p256dh;
	const auth = json.keys?.auth;
	if (!p256dh || !auth) return null;
	return { provider: "webpush", token: subscription.endpoint, keys: { p256dh, auth } };
}

/** Drop the subscription and the worker; the server's registration is removed by the caller. */
export async function unsubscribeWebPush(): Promise<void> {
	if (!webPushSupported()) return;
	const registration = await navigator.serviceWorker.getRegistration(SCOPE);
	const subscription = await registration?.pushManager.getSubscription();
	await subscription?.unsubscribe().catch(() => {});
	await registration?.unregister().catch(() => {});
}

/** A tap on a pushed notification, forwarded by the worker to the open window. */
export function listenWebPushOpen(onOpen: (conversationId: string) => void): () => void {
	if (!webPushSupported()) return () => {};
	const listener = (event: MessageEvent) => {
		if (event.data?.type !== "notification.open") return;
		const id = event.data.conversationId;
		onOpen(typeof id === "string" && id ? id : "");
	};
	navigator.serviceWorker.addEventListener("message", listener);
	return () => navigator.serviceWorker.removeEventListener("message", listener);
}
