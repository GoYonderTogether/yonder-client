import type { PushTokenRegistration } from "@yonder/protocol";
import { useApi, usePerson } from "@yonder/ui-data";
import { useEffect } from "react";
import {
	listenNativePushRegistration,
	nativeNotificationPermission,
	nativePushRegistration,
} from "../lib/native-notifications.ts";

export const NATIVE_NOTIFICATION_PERMISSION_CHANGED = "yonder:notification-permission-changed";

/** Mounted only after this installation's device registration is acknowledged by the server. */
export function NativePushRegistration() {
	const api = useApi();
	const personId = usePerson()?.id;
	useEffect(() => {
		if (!personId) return;
		let active = true;
		let unlisten: (() => void) | undefined;
		let saved: string | null | undefined;
		let pending: Promise<void> = Promise.resolve();
		const register = (token: PushTokenRegistration | null) => {
			pending = pending
				.then(async () => {
					const key = token ? JSON.stringify(token) : null;
					if (!active || key === saved) return;
					if (token) await api.registerPushToken(token);
					else await api.unregisterPushToken();
					saved = key;
				})
				.catch(() => {});
		};
		const sync = () => {
			if (document.visibilityState !== "visible") return;
			void nativeNotificationPermission()
				.then(async (status) => {
					if (!active) return;
					if (status === "denied") register(null);
					if (status !== "granted") return;
					const token = await nativePushRegistration();
					if (token && active) register(token);
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
	}, [api, personId]);
	return null;
}
