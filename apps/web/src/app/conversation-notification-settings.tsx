import { Button } from "@yonder/ui-components";
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
		<div className="flex flex-col gap-[var(--spacing-2)]">
			<label className="flex min-h-[var(--row-height)] cursor-pointer items-center justify-between gap-[var(--spacing-3)] rounded-[var(--radius-control)] bg-[var(--color-bg-surface)] px-[var(--spacing-4)] text-body hover:bg-[var(--color-bg-hover)]">
				{t("messages.muted")}
				<input
					type="checkbox"
					role="switch"
					aria-checked={checked}
					checked={checked}
					disabled={setMuted.isPending}
					onChange={(event) => setMuted.mutate(event.target.checked)}
					className="relative h-[var(--spacing-6)] w-[var(--spacing-10)] shrink-0 appearance-none rounded-full bg-[var(--color-border-strong)] checked:bg-[var(--color-accent)] before:absolute before:top-[var(--spacing-1)] before:left-[var(--spacing-1)] before:size-[var(--spacing-4)] before:rounded-full before:bg-[var(--color-bg-surface)] checked:before:translate-x-[var(--spacing-4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait"
				/>
			</label>
			{setMuted.isError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("messages.muteFailed")}
				</p>
			) : null}
			{checked ? null : <SystemNotificationPermission />}
		</div>
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
