import type { DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { type LayoutMode, Overlay } from "@yonder/ui-shell";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { PRODUCTION_API_ORIGIN } from "../lib/config.ts";
import { copyDeviceDownload, openDeviceDownload, shareDeviceDownload } from "../lib/connect-device-native.ts";
import { isTauri } from "../lib/keychain.ts";
import { isDesktopExperience } from "../lib/platform.ts";

const DEVICE_DOWNLOAD_PLATFORMS = ["macos", "windows", "android", "ios"] as const;
type DownloadRequest = { url: string; mobile: boolean };

export function useConnectDevice(section: "devices" | "connectors", onOpen: (path: string) => void) {
	const [request, setRequest] = useState<DownloadRequest | null>(null);

	function onAddDevice(platforms: readonly DeviceSummary["platform"][] = []) {
		const params = new URLSearchParams();
		for (const platform of DEVICE_DOWNLOAD_PLATFORMS) {
			if (platforms.includes(platform)) params.append("platform", platform);
		}
		const query = params.toString();
		if (!isTauri()) {
			onOpen(`/me/${section}/connect${query ? `?${query}` : ""}`);
			return;
		}
		const url = new URL(`/download?connect-device=1${query ? `&${query}` : ""}`, PRODUCTION_API_ORIGIN);
		setRequest({ url: url.href, mobile: !isDesktopExperience() });
	}

	return {
		onAddDevice,
		overlay: request ? (
			<ConnectDeviceOverlay
				request={request}
				onClose={() => setRequest((current) => (current === request ? null : current))}
			/>
		) : null,
	};
}

export function DownloadBrowserDialog({
	mode,
	onClose,
	onOpen,
	busy = false,
	opening = false,
	children,
}: {
	mode: LayoutMode;
	onClose: () => void;
	onOpen: () => void;
	busy?: boolean;
	opening?: boolean;
	children?: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<Overlay
			open
			onClose={busy ? () => {} : onClose}
			title={t("landing.openDownloadInBrowser")}
			mode={mode}
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			size="small"
			footer={
				<>
					<Button disabled={busy} onClick={onClose}>
						{t("app.cancel")}
					</Button>
					<Button variant="primary" disabled={busy} loading={opening} onClick={onOpen}>
						{t("landing.openDownloadConfirm")}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]">
				<p className="text-body text-[var(--color-text-secondary)]">{t("landing.openDownloadBody")}</p>
				{children}
			</div>
		</Overlay>
	);
}

const nativeActions = { share: shareDeviceDownload, copy: copyDeviceDownload, open: openDeviceDownload };
type NativeAction = keyof typeof nativeActions;
type Feedback = "landing.copied" | "landing.copyFailed" | "landing.shareDownloadFailed" | "landing.openDownloadFailed";

function ConnectDeviceOverlay({
	request: { url, mobile },
	onClose,
}: {
	request: DownloadRequest;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [confirming, setConfirming] = useState(!mobile);
	const [busy, setBusy] = useState<NativeAction | null>(null);
	const [feedback, setFeedback] = useState<Feedback | null>(null);

	async function run(action: NativeAction) {
		setBusy(action);
		setFeedback(null);
		try {
			await nativeActions[action](url);
			if (action === "open") onClose();
			if (action === "copy") setFeedback("landing.copied");
		} catch {
			const failures = {
				share: "landing.shareDownloadFailed",
				copy: "landing.copyFailed",
				open: "landing.openDownloadFailed",
			} as const;
			setFeedback(failures[action]);
		} finally {
			setBusy(null);
		}
	}

	const copyButton = (
		<Button size="lg" disabled={busy !== null} loading={busy === "copy"} onClick={() => void run("copy")}>
			<Copy size={18} aria-hidden="true" />
			{t(mobile ? "landing.copyLink" : "landing.copyDownloadLink")}
		</Button>
	);
	const result = feedback ? (
		<p
			role={feedback === "landing.copied" ? "status" : "alert"}
			className={
				feedback === "landing.copied"
					? "text-caption text-[var(--color-text-secondary)]"
					: "text-caption text-[var(--color-danger)]"
			}
		>
			{t(feedback)}
		</p>
	) : null;

	if (confirming) {
		return (
			<DownloadBrowserDialog
				mode={mobile ? "mobile" : "wide"}
				onClose={
					mobile
						? () => {
								setFeedback(null);
								setConfirming(false);
							}
						: onClose
				}
				onOpen={() => void run("open")}
				busy={busy !== null}
				opening={busy === "open"}
			>
				{mobile ? null : copyButton}
				{result}
			</DownloadBrowserDialog>
		);
	}

	return (
		<Overlay
			open
			onClose={onClose}
			title={t("me.devices.add")}
			mode="mobile"
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			size="small"
		>
			<div className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]">
				<p className="text-body text-[var(--color-text-secondary)]">{t("landing.deviceGuide")}</p>
				<Button
					variant="primary"
					size="lg"
					disabled={busy !== null}
					loading={busy === "share"}
					onClick={() => void run("share")}
				>
					<Share2 size={18} aria-hidden="true" />
					{t("landing.shareDownload")}
				</Button>
				{copyButton}
				<Button
					size="lg"
					disabled={busy !== null}
					aria-haspopup="dialog"
					onClick={() => {
						setFeedback(null);
						setConfirming(true);
					}}
				>
					<ExternalLink size={18} aria-hidden="true" />
					{t("landing.openDownloadInBrowser")}
				</Button>
				{result}
			</div>
		</Overlay>
	);
}
