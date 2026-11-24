import type { PushTokenRegistration } from "@yonder/protocol";
import { useData, usePerson } from "@yonder/ui-data";
import { useEffect } from "react";
import {
	listenNativePushRegistration,
	nativeNotificationPermission,
	nativePushRegistration,
} from "../lib/native-notifications.ts";
import { updatePlatform } from "../updates/drivers.ts";

export const NATIVE_NOTIFICATION_PERMISSION_CHANGED = "yonder:notification-permission-changed";

/** Mounted only after this installation's device registration is acknowledged by the server. */
export function NativePushRegistration() {
	const { api, client } = useData();
	const personId = usePerson()?.id;
	useEffect(() => {
		if (!personId) return;
		let active = true;
		let unlisten: (() => void) | undefined;
		let saved: string | null | undefined;
		let enrollment: boolean | undefined;
		let granted = false;
		const android = updatePlatform() === "android";
		let pending: Promise<void> = Promise.resolve();
		const register = (token: PushTokenRegistration | null) => {
			pending = pending
				.then(async () => {
					const key = token ? JSON.stringify(token) : null;
					if (!active) return;
					if (key !== saved) {
						if (token) await api.registerPushToken(token);
						else await api.unregisterPushToken();
						saved = key;
					}
					if (!active || !android) return;
					const enabled = granted && token?.provider === "fcm";
					if (enabled === enrollment) return;
					// This uses the existing system permission, not a new prompt, and binds to the current registered FCM installation only.
					await client.request("/v1/devices/update", {
						method: "POST",
						body: { channel: "stable", systemPush: enabled },
					});
					enrollment = enabled;
				})
				.catch(() => {});
		};
		const sync = () => {
			if (document.visibilityState !== "visible") return;
			void nativeNotificationPermission()
				.then(async (status) => {
					if (!active) return;
					granted = status === "granted";
					if (!granted) {
						if (status === "denied" || android) register(null);
						return;
					}
					const token = await nativePushRegistration();
					if (active && (token || android)) register(token);
				})
				.catch(() => {});
		};
		void listenNativePushRegistration(register)
			.then((dispose) => {
				if (active) unlisten = dispose;
				else dispose();
			})
			.catch(() => {})
			.finally(() => {
				if (active) sync();
			});
		window.addEventListener("focus", sync);
		window.addEventListener(NATIVE_NOTIFICATION_PERMISSION_CHANGED, sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			active = false;
			unlisten?.();
			window.removeEventListener("focus", sync);
			window.removeEventListener(NATIVE_NOTIFICATION_PERMISSION_CHANGED, sync);
			document.removeEventListener("visibilitychange", sync);
		};
	}, [api, client, personId]);
	return null;
}
