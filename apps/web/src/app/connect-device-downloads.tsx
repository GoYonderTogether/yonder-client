import { DownloadList } from "@yonder/feature-landing";
import { useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";
import { openDeviceDownload } from "../lib/connect-device-native.ts";
import { isTauri } from "../lib/keychain.ts";
import { DownloadBrowserDialog } from "./connect-device.tsx";

const actionClass = "public-action public-action-secondary";

/** One row per system, one action per row. In the desktop app the action opens the system browser itself. */
export function ConnectDeviceDownloads() {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [params] = useSearchParams();
	const [browserUrl, setBrowserUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const native = isTauri();

	return (
		<>
			<p className="px-[var(--spacing-1)] text-body text-[var(--color-text-secondary)]">{t("landing.deviceGuide")}</p>
			<DownloadList
				version={BUILD_VERSION}
				iosUrl={import.meta.env.VITE_IOS_DOWNLOAD_URL}
				connectorPlatforms={params.getAll("platform")}
				renderAction={(platform, url, label) => {
					if (platform === "web") {
						return (
							<Link className={actionClass} to={url}>
								{label}
							</Link>
						);
					}
					if (native) {
						return (
							<button
								type="button"
								className={actionClass}
								onClick={() => {
									setFailed(false);
									openDeviceDownload(url).catch(() => setFailed(true));
								}}
							>
								{label}
							</button>
						);
					}
					if (platform === "ios") {
						return (
							<button type="button" className={actionClass} aria-haspopup="dialog" onClick={() => setBrowserUrl(url)}>
								{label}
							</button>
						);
					}
					return undefined;
				}}
			/>
			{failed ? (
				<p role="alert" className="px-[var(--spacing-1)] text-caption text-[var(--color-danger)]">
					{t("landing.openDownloadFailed")}
				</p>
			) : null}
			{browserUrl ? (
				<DownloadBrowserDialog
					mode={mode}
					onClose={() => setBrowserUrl(null)}
					onOpen={() => {
						window.open(browserUrl, "_blank", "noopener,noreferrer");
						setBrowserUrl(null);
					}}
				/>
			) : null}
		</>
	);
}
