import { ListGroup, ListRow, ListSwitch } from "@yonder/ui-components";
import { useData, useNotificationPreferences, usePerson, useUpdateNotificationPreferences } from "@yonder/ui-data";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../lib/keychain.ts";
import { isNativeIosNotifications, openIosNotificationSettings } from "../lib/native-notifications.ts";
import {
	disableNotifications,
	enableNotifications,
	type NotificationPermissionState,
	notificationPermissionState,
} from "../lib/notification-permission.ts";
import { NATIVE_NOTIFICATION_PERMISSION_CHANGED } from "./native-push-registration.tsx";

/**
 * 「我 › 通用 › 消息通知」 (`yonder/docs/notifications.md` 第二节、第三节).
 *
 * Two things live here: whether this installation may be alerted at all (a system permission, which
 * the person can only grant from a prompt this screen triggers), and how much of a message an alert
 * may show (the account's own setting, applied by the server when it builds the push).
 */
export function NotificationSettings() {
	const { t } = useTranslation();
	const { api } = useData();
	const personId = usePerson()?.id;
	const preferences = useNotificationPreferences();
	const update = useUpdateNotificationPreferences();
	const [state, setState] = useState<NotificationPermissionState | null>(null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const refresh = useCallback(() => {
		void notificationPermissionState()
			.then(setState)
			.catch(() => setState("unsupported"));
	}, []);
	useEffect(() => {
		refresh();
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, [refresh]);

	const content = update.isPending
		? (update.variables?.content ?? preferences.data?.content)
		: preferences.data?.content;

	async function turnOn() {
		if (busy) return;
		setBusy(true);
		setFailed(false);
		try {
			const result = await enableNotifications(() => api.pushKey().then((key) => key.publicKey));
			if (result.registration) await api.registerPushToken(result.registration);
			setState(result.state);
			window.dispatchEvent(new Event(NATIVE_NOTIFICATION_PERMISSION_CHANGED));
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	async function turnOff() {
		if (busy) return;
		setBusy(true);
		setFailed(false);
		try {
			await disableNotifications();
			await api.unregisterPushToken();
			refresh();
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	async function openSystemSettings() {
		setBusy(true);
		setFailed(false);
		try {
			setFailed(!(await openIosNotificationSettings()));
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	if (!personId) return null;
	const on = state === "granted";
	const useIosSettings = isNativeIosNotifications() && (on || state === "denied");
	return (
		<div className="flex flex-col gap-[var(--spacing-3)]">
			<ListGroup
				title={t("notifications.title")}
				footer={useIosSettings && failed ? <span role="alert">{t("notifications.failed")}</span> : undefined}
			>
				{useIosSettings ? (
					<ListRow
						title={t("messages.openNotificationSettings")}
						subtitle={t(on ? "notifications.allowed" : "notifications.denied")}
						chevron
						disabled={busy}
						onClick={() => void openSystemSettings()}
					/>
				) : (
					<ListSwitch
						title={t("notifications.enable")}
						subtitle={
							state === "unsupported"
								? t("notifications.unsupported")
								: state === "denied"
									? t("notifications.denied")
									: t("notifications.enableDescription")
						}
						checked={on}
						busy={busy}
						disabled={state === null || state === "unsupported" || (state === "denied" && isTauri())}
						onChange={(next) => void (next ? turnOn() : turnOff())}
						error={failed ? t("notifications.failed") : undefined}
					/>
				)}
			</ListGroup>
			{on ? (
				<ListGroup title={t("notifications.contentTitle")} footer={t("notifications.contentFooter")}>
					<ListSwitch
						title={t("notifications.showContent")}
						subtitle={t("notifications.showContentDescription")}
						checked={content !== "hidden"}
						busy={update.isPending}
						onChange={(next) =>
							preferences.data &&
							update.mutate({ content: next ? "full" : "hidden", version: preferences.data.version })
						}
						error={update.isError ? t("notifications.contentFailed") : undefined}
					/>
				</ListGroup>
			) : null}
		</div>
	);
}
