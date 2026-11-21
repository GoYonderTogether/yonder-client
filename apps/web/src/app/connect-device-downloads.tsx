import { DownloadList } from "@yonder/feature-landing";
import { useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";
import { DownloadBrowserDialog } from "./connect-device.tsx";

const actionClass = "public-action public-action-secondary";

export function ConnectDeviceDownloads() {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [params] = useSearchParams();
	const [browserUrl, setBrowserUrl] = useState<string | null>(null);

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
