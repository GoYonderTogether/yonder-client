import { Button, ListGroup, ListSwitch } from "@yonder/ui-components";
import { useSetConversationMuted } from "@yonder/ui-data";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../lib/keychain.ts";
import { nativeNotificationPermission, requestNativeNotificationPermission } from "../lib/native-notifications.ts";
import { isDesktopExperience } from "../lib/platform.ts";
import { NATIVE_NOTIFICATION_PERMISSION_CHANGED } from "./native-push-registration.tsx";

export function ConversationNotificationSettings({ id, muted }: { id: string; muted: boolean }) {
	const { t } = useTranslation();
	const setMuted = useSetConversationMuted(id);
	const checked = setMuted.isPending ? (setMuted.variables ?? muted) : muted;
	return (
		<ListGroup title={t("messages.notificationsSection")}>
			<ListSwitch
				title={t("messages.muted")}
				checked={checked}
				busy={setMuted.isPending}
				onChange={(value) => setMuted.mutate(value)}
				error={setMuted.isError ? t("messages.muteFailed") : undefined}
			/>
			{checked ? null : (
				<li className="flex flex-col px-[var(--spacing-1)] pt-[var(--spacing-2)]">
					<SystemNotificationPermission />
				</li>
			)}
		</ListGroup>
	);
}

function SystemNotificationPermission() {
	const { t } = useTranslation();
	const shell = isTauri();
	const browser = !shell && isDesktopExperience() && typeof Notification !== "undefined";
	const [permission, setPermission] = useState<NotificationPermission | null>(() =>
		browser ? Notification.permission : null,
	);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!shell && !browser) return;
		let active = true;
		const update = () => {
			void (shell ? nativeNotificationPermission() : Promise.resolve(Notification.permission))
				.then((status) => {
					if (active) setPermission(status);
				})
				.catch(() => {});
		};
		update();
		window.addEventListener("focus", update);
		return () => {
			active = false;
			window.removeEventListener("focus", update);
		};
	}, [shell, browser]);
	if (!permission || permission === "granted") return null;
	if (permission === "denied")
		return <p className="text-caption text-[var(--color-text-secondary)]">{t("messages.systemNotificationsDenied")}</p>;
	return (
		<Button
			variant="link"
			className="self-start"
			loading={busy}
			onClick={() => {
				setBusy(true);
				void (
					shell
						? requestNativeNotificationPermission().then((granted) => (granted ? "granted" : "denied"))
						: Notification.requestPermission()
				)
					.then((status) => {
						setPermission(status);
						if (shell) window.dispatchEvent(new Event(NATIVE_NOTIFICATION_PERMISSION_CHANGED));
					})
					.catch(() => {})
					.finally(() => setBusy(false));
			}}
		>
			{t("messages.enableSystemNotifications")}
		</Button>
	);
}
