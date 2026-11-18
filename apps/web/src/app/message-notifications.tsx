import type { MessageNotification } from "@yonder/protocol";
import { useData } from "@yonder/ui-data";
import { useEffect, useEffectEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isForeground, subscribeForeground } from "../lib/foreground.ts";
import { isTauri } from "../lib/keychain.ts";
import {
	isNativeMobileNotifications,
	listenNativeNotificationOpen,
	showDesktopNotification,
} from "../lib/native-notifications.ts";

export function MessageNotifications({
	personId,
	onOpen,
}: {
	personId: string | undefined;
	onOpen: (conversationId: string) => void;
}) {
	const { t } = useTranslation();
	const { realtime } = useData();
	const active = useRef(false);
	const seen = useRef(new Set<string>());
	const browserNotices = useRef(new Set<Notification>());
	const receive = useEffectEvent((notification: MessageNotification) => {
		if (!personId || seen.current.has(notification.id)) return;
		seen.current.add(notification.id);
		if (seen.current.size > 100) {
			const first = seen.current.values().next().value;
			if (first) seen.current.delete(first);
		}
		if (isForeground()) return;
		const title = notification.senderName;
		const body =
			notification.conversationTitle ??
			t(notification.senderKind === "bot" ? "messages.botReply" : "messages.newMessage");
		if (isTauri()) {
			// A native mobile background event is presented by APNs or FCM.
			if (!isNativeMobileNotifications())
				void showDesktopNotification({
					title,
					body,
					notificationId: notification.id,
					conversationId: notification.conversationId,
					messageId: notification.messageId,
					recipientMemberId: personId,
				}).catch(() => {});
			return;
		}
		if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
		const show = () => {
			if (!active.current || isForeground() || Notification.permission !== "granted") return;
			try {
				const notice = new Notification(title, { body, tag: notification.id });
				browserNotices.current.add(notice);
				notice.onclose = () => browserNotices.current.delete(notice);
				notice.onclick = () => {
					window.focus();
					onOpen(notification.conversationId);
					notice.close();
				};
			} catch {
				// The unread badge is available on browsers without system notification support.
			}
		};
		if (navigator.locks) {
			void navigator.locks
				.request(foregroundLock(personId), { ifAvailable: true }, (lock) => {
					if (lock) show();
				})
				.catch(show);
		} else {
			show();
		}
	});
	const openFromSystem = useEffectEvent((conversationId: string, recipientMemberId?: string) => {
		if (!personId || recipientMemberId !== personId) return;
		onOpen(conversationId);
	});

	useEffect(() => {
		if (!personId) return;
		active.current = true;
		const releaseLock = isTauri() ? undefined : holdForegroundLock(personId);
		const openNotices = browserNotices.current;
		const unsubscribe = realtime.subscribeEvents((event) => {
			if (event.type === "notification.created") receive(event.notification);
		});
		return () => {
			active.current = false;
			releaseLock?.();
			unsubscribe();
			for (const notice of openNotices) notice.close();
			openNotices.clear();
		};
	}, [realtime, personId]);
	useEffect(() => {
		if (!personId || !isTauri()) return;
		let active = true;
		let unlisten: (() => void) | undefined;
		void listenNativeNotificationOpen(({ conversationId, recipientMemberId }) => {
			if (active) openFromSystem(conversationId, recipientMemberId);
		})
			.then((dispose) => {
				if (active) unlisten = dispose;
				else dispose();
			})
			.catch(() => {});
		return () => {
			active = false;
			unlisten?.();
		};
	}, [personId]);

	return null;
}

const foregroundLock = (personId: string) => `yonder:notification-foreground:${personId}`;

/** Background tabs can present a system notice only if this account has no focused Yonder tab. */
function holdForegroundLock(personId: string) {
	const locks = navigator.locks;
	if (!locks) return;
	let release: (() => void) | undefined;
	const sync = () => {
		if (!isForeground()) {
			release?.();
			release = undefined;
		} else if (!release) {
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			void locks.request(foregroundLock(personId), { mode: "shared" }, () => held).catch(() => {});
		}
	};
	const unsubscribe = subscribeForeground(sync);
	sync();
	return () => {
		unsubscribe();
		release?.();
	};
}
