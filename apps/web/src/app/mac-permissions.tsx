import type { DeviceSummary } from "@yonder/protocol";
import { Button, Card } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeForeground } from "../lib/foreground.ts";
import {
	type MacPermission,
	type MacPermissionStatus,
	macPermissionStatus,
	openMacPermissionSettings,
	requestMacMicrophone,
	supportsMacPermissions,
} from "../lib/mac-permissions.ts";
import { nativeNotificationPermission, requestNativeNotificationPermission } from "../lib/native-notifications.ts";
import { NATIVE_NOTIFICATION_PERMISSION_CHANGED } from "./native-push-registration.tsx";

const management = ["microphone", "notifications"] as const;
const unknown = {
	microphone: "unknown",
	notifications: "unknown",
} satisfies Record<MacPermission, MacPermissionStatus>;

export function renderMacPermissionManagement(device: DeviceSummary) {
	return device.current && device.platform === "macos" && supportsMacPermissions() ? <MacPermissionManagement /> : null;
}

function MacPermissionManagement() {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="ghost" size="sm" className="shrink-0" aria-haspopup="dialog" onClick={() => setOpen(true)}>
				{t("me.macPermissions.manage")}
			</Button>
			<Overlay
				open={open}
				mode={mode === "mobile" ? "wide" : mode}
				mobilePresentation="sheet"
				title={t("me.macPermissions.manage")}
				closeLabel={t("app.close")}
				onClose={() => setOpen(false)}
			>
				{open && (
					<div className="p-[var(--spacing-5)]">
						<PermissionCards />
					</div>
				)}
			</Overlay>
		</>
	);
}

function PermissionCards() {
	const { t } = useTranslation();
	const descriptionId = useId();
	const [statuses, setStatuses] = useState<Record<MacPermission, MacPermissionStatus>>(unknown);
	const [busy, setBusy] = useState<MacPermission | null>(null);
	const [error, setError] = useState(false);
	const revision = useRef(0);
	const refresh = useCallback(async () => {
		const current = ++revision.current;
		const [mac, notifications] = await Promise.allSettled([macPermissionStatus(), nativeNotificationPermission()]);
		if (current !== revision.current) return;
		setStatuses({
			microphone: mac.status === "fulfilled" ? mac.value.microphone : "unknown",
			notifications: notifications.status === "fulfilled" ? notifications.value : "unknown",
		});
	}, []);
	useEffect(() => {
		const update = () => {
			if (document.hasFocus() && document.visibilityState === "visible") void refresh();
		};
		const stop = subscribeForeground(update);
		let active = true;
		const nativeFocus = import("@tauri-apps/api/window")
			.then(({ getCurrentWindow }) =>
				getCurrentWindow().listen("tauri://focus", () => {
					if (active) void refresh();
				}),
			)
			.catch(() => undefined);
		void refresh();
		return () => {
			active = false;
			revision.current++;
			stop();
			void nativeFocus.then((unlisten) => unlisten?.()).catch(() => undefined);
		};
	}, [refresh]);

	async function authorize(permission: MacPermission) {
		if (busy) return;
		setBusy(permission);
		setError(false);
		try {
			if (permission === "microphone" && statuses.microphone === "default") {
				await requestMacMicrophone();
			} else if (permission === "notifications" && statuses.notifications === "default") {
				await requestNativeNotificationPermission();
				window.dispatchEvent(new Event(NATIVE_NOTIFICATION_PERMISSION_CHANGED));
			} else {
				await openMacPermissionSettings(permission);
			}
			await refresh();
		} catch {
			setError(true);
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="flex flex-col gap-[var(--spacing-3)]">
			{management.map((permission) => {
				const status = statuses[permission];
				const systemAction = status !== "default";
				return (
					<Card key={permission} className="flex flex-wrap items-center justify-between gap-[var(--spacing-3)]">
						<div className="min-w-0 flex-1 basis-1/2">
							<p id={`${descriptionId}-${permission}`} className="text-body text-[var(--color-text-primary)]">
								{t(`me.macPermissions.${permission}.description`)}
							</p>
							<p className="text-caption text-[var(--color-text-tertiary)]">
								{t(`me.macPermissions.status.${status}`)}
							</p>
						</div>
						<Button
							variant="secondary"
							size="sm"
							aria-describedby={`${descriptionId}-${permission}`}
							onClick={() => void authorize(permission)}
							disabled={busy !== null}
							loading={busy === permission}
						>
							{t(systemAction ? "me.macPermissions.openSettings" : `me.macPermissions.${permission}.authorize`)}
						</Button>
					</Card>
				);
			})}
			{error && (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("me.macPermissions.failed")}
				</p>
			)}
		</div>
	);
}
