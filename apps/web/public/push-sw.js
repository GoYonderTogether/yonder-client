// The Web Push receiver (docs/notifications.md 第二节). The app registers this worker only after the
// person turns notifications on, and unregisters it when they turn them off.
//
// The server encrypts the whole notification, so this worker never decides what may be shown: it
// displays the title and body it was given and opens the conversation the payload names.
self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	if (!event.data) return;
	let payload;
	try {
		payload = event.data.json();
	} catch {
		return;
	}
	const title = typeof payload.title === "string" && payload.title ? payload.title : "Yonder";
	const body = typeof payload.body === "string" ? payload.body : "";
	const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			tag: typeof payload.notificationId === "string" ? payload.notificationId : undefined,
			data: { conversationId },
			// The app draws its own icon set; the system shows the same mark it shows in the task bar.
			icon: "/icon-192.png",
			badge: "/icon-192.png",
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const conversationId = event.notification.data?.conversationId;
	const path = conversationId ? `/messages/${encodeURIComponent(conversationId)}` : "/messages";
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of windows) {
				// A window already showing Yonder is focused and told where to go.
				if (new URL(client.url).origin === self.location.origin) {
					await client.focus();
					client.postMessage({ type: "notification.open", conversationId });
					return;
				}
			}
			await self.clients.openWindow(path);
		})(),
	);
});
