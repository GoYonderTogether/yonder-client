import type { DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { Overlay } from "@yonder/ui-shell";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PRODUCTION_API_ORIGIN } from "../lib/config.ts";
import { copyDeviceDownload, openDeviceDownload, shareDeviceDownload } from "../lib/connect-device-native.ts";
import { isTauri } from "../lib/keychain.ts";
import { isDesktopExperience } from "../lib/platform.ts";

const DEVICE_DOWNLOAD_PLATFORMS = ["macos", "windows", "android", "ios"] as const;
type DownloadRequest = { url: string; mobile: boolean };

export function useConnectDevice(onOpen: (path: string) => void) {
	const [request, setRequest] = useState<DownloadRequest | null>(null);
	const opening = useRef(false);

	async function connectDevice(platforms: readonly DeviceSummary["platform"][] = []) {
		const params = new URLSearchParams({ "connect-device": "1" });
		for (const platform of DEVICE_DOWNLOAD_PLATFORMS) {
			if (platforms.includes(platform)) params.append("platform", platform);
		}
		const path = `/download?${params}`;
		if (!isTauri()) {
			onOpen(path);
			return;
		}
		const url = new URL(path, PRODUCTION_API_ORIGIN).href;
		if (!isDesktopExperience()) {
			setRequest({ url, mobile: true });
			return;
		}
		if (opening.current) return;
		opening.current = true;
		try {
			await openDeviceDownload(url);
		} catch {
			setRequest({ url, mobile: false });
		} finally {
			opening.current = false;
		}
	}

	return {
		onAddDevice: (platforms?: readonly DeviceSummary["platform"][]) => void connectDevice(platforms),
		overlay: request ? (
			<ConnectDeviceOverlay
				request={request}
				onClose={() => setRequest((current) => (current === request ? null : current))}
			/>
		) : null,
	};
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
	const [busy, setBusy] = useState<NativeAction | null>(null);
	const [feedback, setFeedback] = useState<Feedback | null>(mobile ? null : "landing.openDownloadFailed");

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

	return (
		<Overlay
			open
			onClose={onClose}
			title={t("me.devices.add")}
			mode={mobile ? "mobile" : "wide"}
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			size="small"
		>
			<div className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]">
				<p className="text-body text-[var(--color-text-secondary)]">{t("landing.deviceGuide")}</p>
				{mobile ? (
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
				) : null}
				<Button
					variant={mobile ? "secondary" : "primary"}
					size="lg"
					disabled={busy !== null}
					loading={busy === "copy"}
					onClick={() => void run("copy")}
				>
					<Copy size={18} aria-hidden="true" />
					{t(mobile ? "landing.copyLink" : "landing.copyDownloadLink")}
				</Button>
				{mobile ? (
					<Button
						variant="secondary"
						size="lg"
						disabled={busy !== null}
						loading={busy === "open"}
						onClick={() => void run("open")}
					>
						<ExternalLink size={18} aria-hidden="true" />
						{t("landing.openDownloadInBrowser")}
					</Button>
				) : null}
				{feedback ? (
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
				) : null}
			</div>
		</Overlay>
	);
}
