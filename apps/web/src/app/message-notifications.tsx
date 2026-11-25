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
import { listenWebPushOpen, webPushSupported } from "../lib/web-push.ts";

/**
 * Presents a notification the server pushed over the socket (docs/notifications.md 第二节).
 *
 * The server already decided what may be shown; this only decides whether *this* screen should
 * show it. A phone is quiet about the chat it is showing and speaks up about any other; a desk is
 * quiet whenever its window is in front, because the badge is enough there.
 */
export function MessageNotifications({
	personId,
	conversationId,
	onOpen,
}: {
	personId: string | undefined;
	/** The conversation on screen, when the person is in a chat. */
	conversationId: string | null;
	onOpen: (conversationId: string) => void;
}) {
	const { t } = useTranslation();
	const { realtime } = useData();
	const active = useRef(false);
	const seen = useRef(new Set<string>());
	const browserNotices = useRef(new Set<Notification>());
	const current = useRef(conversationId);
	useEffect(() => {
		current.current = conversationId;
	}, [conversationId]);
	const receive = useEffectEvent((notification: MessageNotification) => {
		if (!personId || seen.current.has(notification.id)) return;
		seen.current.add(notification.id);
		if (seen.current.size > 100) {
			const first = seen.current.values().next().value;
			if (first) seen.current.delete(first);
		}
		const phone = isNativeMobileNotifications();
		// A phone showing this very conversation needs nothing; a desk in front needs nothing either.
		if (phone) {
			if (isForeground() && notification.conversationId === current.current) return;
		} else if (isForeground()) return;
		const title =
			notification.conversationTitle && notification.senderKind !== "bot"
				? `${notification.senderName} · ${notification.conversationTitle}`
				: notification.senderName;
		const body =
			notification.body || t(notification.kind === "bot_reply" ? "messages.botReply" : "messages.newMessage");
		const target = {
			notificationId: notification.id,
			conversationId: notification.conversationId ?? "",
			messageId: notification.messageId ?? "",
			recipientMemberId: personId,
		};
		if (isTauri()) {
			// A native mobile background event is presented by APNs or FCM; the desktop draws its own.
			if (!phone) void showDesktopNotification({ title, body, ...target }).catch(() => {});
			return;
		}
		// A browser that subscribed to Web Push lets the service worker present it, so a closed tab
		// still hears; presenting it here too would show the same message twice.
		if (webPushSupported() && navigator.serviceWorker?.controller) return;
		if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
		const show = () => {
			if (!active.current || isForeground() || Notification.permission !== "granted") return;
			try {
				const notice = new Notification(title, { body, tag: notification.id });
				browserNotices.current.add(notice);
				notice.onclose = () => browserNotices.current.delete(notice);
				notice.onclick = () => {
					window.focus();
					onOpen(notification.conversationId ?? "");
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
	const openFromSystem = useEffectEvent((target: string, recipientMemberId?: string) => {
		if (!personId || recipientMemberId !== personId) return;
		onOpen(target);
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
		void listenNativeNotificationOpen(({ conversationId }) => {
			if (active) openFromSystem(conversationId);
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
	// A tap on a Web Push notification, forwarded by the service worker.
	useEffect(() => {
		if (!personId || isTauri()) return;
		return listenWebPushOpen((id: string) => openFromSystem(id));
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
