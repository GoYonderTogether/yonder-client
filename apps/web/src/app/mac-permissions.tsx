import type { DeviceSummary } from "@yonder/protocol";
import { Button, Card } from "@yonder/ui-components";
import type { Storage } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeForeground } from "../lib/foreground.ts";
import {
	type MacPermission,
	type MacPermissionStatus,
	macPermissionStatus,
	openMacPermissionSettings,
	requestMacAccessibility,
	requestMacMicrophone,
	supportsMacPermissions,
} from "../lib/mac-permissions.ts";
import { nativeNotificationPermission, requestNativeNotificationPermission } from "../lib/native-notifications.ts";
import { NATIVE_NOTIFICATION_PERMISSION_CHANGED } from "./native-push-registration.tsx";

const initial = ["fullDisk", "accessibility"] as const;
const management = [...initial, "microphone", "notifications"] as const;
const unknown = {
	fullDisk: "manual",
	accessibility: "unknown",
	microphone: "unknown",
	notifications: "unknown",
} satisfies Record<MacPermission, MacPermissionStatus>;

export function MacPermissionsGate({
	account,
	storage,
	children,
}: {
	account: string | undefined;
	storage: Storage;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	const heading = useRef<HTMLHeadingElement>(null);
	const [finished, setFinished] = useState<string | null>(null);
	const key = account && supportsMacPermissions() ? `mac-permissions-v1:${account}` : undefined;
	const show = key !== undefined && finished !== key && storage.get(key) !== "done";
	useEffect(() => {
		if (show) heading.current?.focus();
	}, [show]);
	return (
		<>
			<div hidden={show} className={show ? undefined : "contents"}>
				{children}
			</div>
			{show ? (
				<main className="fixed inset-0 z-40 flex overflow-y-auto bg-[var(--color-bg-base)] p-[var(--spacing-6)] pt-[var(--titlebar-height)]">
					<div data-tauri-drag-region aria-hidden className="fixed inset-x-0 top-0 h-[var(--titlebar-height)]" />
					<div className="m-auto flex w-full max-w-[var(--width-reading)] flex-col gap-[var(--spacing-6)]">
						<h1
							ref={heading}
							tabIndex={-1}
							className="text-center text-h1 text-[var(--color-text-primary)] outline-none"
						>
							{t("me.macPermissions.introTitle")}
						</h1>
						<PermissionCards intro />
						<Button
							variant="primary"
							className="self-center"
							onClick={() => {
								storage.set(key, "done");
								setFinished(key);
							}}
						>
							{t("me.macPermissions.continue")}
						</Button>
					</div>
				</main>
			) : null}
		</>
	);
}

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

function PermissionCards({ intro = false }: { intro?: boolean }) {
	const { t } = useTranslation();
	const descriptionId = useId();
	const [statuses, setStatuses] = useState<Record<MacPermission, MacPermissionStatus> | null>(null);
	const [busy, setBusy] = useState<MacPermission | null>(null);
	const [error, setError] = useState(false);
	const [askedAccessibility, setAskedAccessibility] = useState(false);
	const revision = useRef(0);
	const refresh = useCallback(async () => {
		const current = ++revision.current;
		const [mac, notifications] = await Promise.allSettled([
			macPermissionStatus(),
			intro ? Promise.resolve("unknown" as const) : nativeNotificationPermission(),
		]);
		if (current !== revision.current) return;
		setStatuses({
			...unknown,
			...(mac.status === "fulfilled" ? mac.value : {}),
			notifications: notifications.status === "fulfilled" ? notifications.value : "unknown",
		});
	}, [intro]);
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
			if (permission === "accessibility" && statuses?.accessibility !== "granted" && !askedAccessibility) {
				await requestMacAccessibility();
				setAskedAccessibility(true);
			} else if (permission === "microphone" && statuses?.microphone === "default") {
				await requestMacMicrophone();
			} else if (permission === "notifications" && statuses?.notifications === "default") {
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
			{(intro ? initial : management).map((permission) => {
				const status = (statuses ?? unknown)[permission];
				const introGranted = intro && status === "granted";
				const systemAction =
					permission === "fullDisk" ||
					(permission === "accessibility" ? askedAccessibility || status === "granted" : status !== "default");
				return (
					<Card key={permission} className="flex flex-wrap items-center justify-between gap-[var(--spacing-3)]">
						<div className="min-w-0 flex-1 basis-1/2">
							<p id={`${descriptionId}-${permission}`} className="text-body text-[var(--color-text-primary)]">
								{t(`me.macPermissions.${permission}.description`)}
							</p>
							{!intro && (
								<p className="text-caption text-[var(--color-text-tertiary)]">
									{t(`me.macPermissions.status.${status}`)}
								</p>
							)}
						</div>
						{introGranted && (
							<span className="text-caption text-[var(--color-text-secondary)]">
								{t("me.macPermissions.introGranted")}
							</span>
						)}
						{!introGranted && (!intro || statuses !== null) && (
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
						)}
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
