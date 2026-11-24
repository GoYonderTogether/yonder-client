import { expect, test, type WebSocketRoute } from "@playwright/test";
import { bot, conversation, person } from "./chat-fixture.ts";

test("realtime renews a rejected handshake without an authenticated HTTP request or page reload", async ({ page }) => {
	let refreshes = 0;
	let original: WebSocketRoute | undefined;
	let disconnected = false;
	let recovered = false;

	await page.route("**/v1/**", (route) => {
		switch (new URL(route.request().url()).pathname) {
			case "/v1/auth/refresh":
				refreshes++;
				return route.fulfill({ json: { accessToken: refreshes === 1 ? "expiring" : "renewed", expiresIn: 3600 } });
			case "/v1/me":
				return route.fulfill({ json: { member: person, bot, signInMethods: [], settings: { locale: "en" } } });
			case "/v1/conversations":
				return route.fulfill({ json: { items: [conversation] } });
			default:
				return route.fulfill({ json: { items: [] } });
		}
	});
	// The expired reconnect proceeds to the preview server, which rejects the upgrade.
	await page.routeWebSocket(
		(url) => url.pathname === "/v1/realtime" && (!disconnected || url.searchParams.get("token") === "renewed"),
		(socket) => {
			if (disconnected) recovered = true;
			else original = socket;
			socket.onMessage((message) => {
				if (String(message).includes('"ping"')) socket.send('{"type":"pong"}');
			});
		},
	);

	await page.goto(`/messages/${conversation.id}`);
	await expect.poll(() => Boolean(original)).toBe(true);
	expect(refreshes).toBe(1);
	disconnected = true;
	await original?.close({ code: 1012, reason: "fixture service restart" });
	await expect.poll(() => recovered).toBe(true);
	expect(refreshes).toBe(2);
});
