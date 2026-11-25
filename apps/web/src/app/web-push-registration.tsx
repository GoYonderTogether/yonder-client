import { useData, usePerson } from "@yonder/ui-data";
import { useEffect } from "react";
import { isTauri } from "../lib/keychain.ts";
import { subscribeWebPush } from "../lib/web-push.ts";

/**
 * Keeps this browser's Web Push subscription registered with the server
 * (docs/notifications.md 第二节). The subscription lives in the browser and survives a sign-out;
 * the server's row does not, so a signed-in browser that already has permission re-registers it.
 *
 * Mounted only for the browser app: the desktop and mobile shells register their own token.
 */
export function WebPushRegistration() {
	const { api, realtime } = useData();
	const personId = usePerson()?.id;
	useEffect(() => {
		if (!personId || isTauri()) return;
		let active = true;
		let saved: string | undefined;
		const sync = () => {
			if (document.visibilityState !== "visible") return;
			void api
				.pushKey()
				.then(async ({ publicKey }) => {
					if (!publicKey || Notification.permission !== "granted") return;
					const registration = await subscribeWebPush(publicKey).catch(() => null);
					if (!active || !registration || registration.token === saved) return;
					await api.registerPushToken(registration);
					saved = registration.token;
				})
				.catch(() => {});
		};
		window.addEventListener("focus", sync);
		document.addEventListener("visibilitychange", sync);
		// A socket that reconnects is also a moment the server may have lost this subscription.
		const unsubscribe = realtime.subscribe(sync);
		sync();
		return () => {
			active = false;
			window.removeEventListener("focus", sync);
			document.removeEventListener("visibilitychange", sync);
			unsubscribe();
		};
	}, [api, realtime, personId]);
	return null;
}
