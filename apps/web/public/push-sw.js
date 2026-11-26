// The installed web app and Web Push share this root registration so existing subscriptions survive.
//
// The server encrypts the whole notification, so this worker never decides what may be shown: it
// displays the title and body it was given and opens the conversation the payload names.
const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Yonder</title>
<style>
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; font-family: system-ui, sans-serif; }
main { padding: 1rem; text-align: center; }
button { font: inherit; padding: .5em 1em; }
</style>
<main>
  <h1>You’re offline</h1>
  <button type="button">Try again</button>
</main>
<script>
const retry = document.querySelector('button');
retry.addEventListener('click', () => location.reload());
let locale;
try { locale = localStorage.getItem('yonder.locale'); } catch {}
if (locale === 'zh-CN' || (locale !== 'en' && /^zh\\b/i.test(navigator.language))) {
  document.documentElement.lang = 'zh-CN';
  document.querySelector('h1').textContent = '网络连接已断开';
  retry.textContent = '重试';
}
</script>
</html>`;

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET" || request.mode !== "navigate") return;
	const { origin, pathname } = new URL(request.url);
	if (origin !== self.location.origin || /^\/(?:api|assets|files|v1)(?:\/|$)/.test(pathname)) return;
	if (/^\/[\w-]+\.(?:ico|js|json|png|svg|webmanifest)$/.test(pathname)) return;
	// Navigation follows the deployed HTML. The ordinary HTTP cache handles hashed assets.
	event.respondWith(
		fetch(request).catch(
			() =>
				new Response(OFFLINE_PAGE, {
					status: 503,
					headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
				}),
		),
	);
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
