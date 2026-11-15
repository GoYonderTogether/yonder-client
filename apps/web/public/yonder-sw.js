// Retires the service worker the previous Yonder web app registered at this same URL.
// That worker cached hashed assets under caches named "yonder-console-…". This file replaces it:
// it removes those caches and unregisters itself, so returning visitors load the new app straight
// from the network. The new app does not register a service worker.
self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(names.filter((name) => name.startsWith("yonder-console-")).map((name) => caches.delete(name)));
			await self.registration.unregister();
		})(),
	);
});
