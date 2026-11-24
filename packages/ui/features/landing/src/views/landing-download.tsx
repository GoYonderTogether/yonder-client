import { Menu } from "@yonder/ui-components";
import { useData } from "@yonder/ui-data";
import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createDownloadCatalog } from "../downloads.ts";
import type { DownloadPlatform } from "../environment.ts";
import { detectEnvironment, readPlatformChoice, writePlatformChoice } from "../environment.ts";
import { LANDING_PLATFORM_ICONS } from "./landing-platform-icons.ts";
import type { PublicViewProps } from "./public-layout.tsx";

const PLATFORMS: DownloadPlatform[] = ["macos", "windows", "android", "ios", "web"];

/** The fallback keeps copy available in browsers without the asynchronous Clipboard API. */
function copyWithSelection(text: string): boolean {
	const previous = document.activeElement;
	const input = document.createElement("textarea");
	input.value = text;
	input.setAttribute("readonly", "");
	input.style.position = "fixed";
	input.style.opacity = "0";
	document.body.append(input);
	input.select();
	input.setSelectionRange(0, input.value.length);
	let copied = false;
	try {
		copied = document.execCommand("copy");
	} finally {
		input.remove();
		if (previous instanceof HTMLElement) previous.focus();
	}
	return copied;
}

async function copyLink(): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(window.location.href);
			return true;
		}
	} catch {
		// Some embedded browsers expose the API but deny it.
	}
	try {
		return copyWithSelection(window.location.href);
	} catch {
		return false;
	}
}

/** Installer options are public; embedded browsers only get the copy-to-browser action. */
export function DownloadControls({ version, iosUrl, appPath }: PublicViewProps & { appPath: string | null }) {
	const { t } = useTranslation();
	const { storage } = useData();
	const [environment] = useState(() => detectEnvironment(navigator.userAgent, navigator.maxTouchPoints));
	const [choice, setChoice] = useState(() => readPlatformChoice(storage));
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
	const catalog = createDownloadCatalog(version, { ...(iosUrl ? { iosUrl } : {}) });
	const platform = choice ?? (environment.type === "browser" ? environment.platform : "web");
	const download = environment.type === "browser" && platform !== "web" ? catalog[platform].url : null;
	const inApp = environment.type === "in-app";
	const RecommendedIcon = download ? LANDING_PLATFORM_ICONS[platform] : Download;
	const downloadOptions = PLATFORMS.flatMap((item) => {
		const entry = catalog[item];
		if (item === "web" || !entry.url) return [];
		const name = t(`landing.platforms.${item}`);
		const requirement =
			item === "macos" ? t("landing.macRequirement") : item === "windows" ? t("landing.windowsRequirement") : "";
		const Icon = LANDING_PLATFORM_ICONS[item];
		return [
			{
				id: entry.url,
				platform: item,
				label: requirement ? `${name} · ${requirement}` : name,
				icon: <Icon size={16} aria-hidden="true" />,
			},
		];
	});

	return (
		<div className="lp-download">
			{inApp ? (
				<p className="lp-download-hint">{t("landing.inApp", { app: t(`landing.apps.${environment.app}`) })}</p>
			) : null}
			<div className="lp-actions">
				{!inApp ? (
					<div className="lp-download-split">
						<a className="lp-action lp-action-secondary lp-download-main" href={download ?? "/download"}>
							<RecommendedIcon size={16} aria-hidden="true" />
							{download
								? t("landing.downloadFor", { platform: t(`landing.platforms.${platform}`) })
								: t("landingPage.nav.download")}
						</a>
						<Menu
							className="lp-download-menu"
							label={t("landingPage.downloadOptions")}
							items={downloadOptions}
							onSelect={(url) => {
								const selected = downloadOptions.find((option) => option.id === url);
								if (!selected) return;
								if (!appPath) {
									writePlatformChoice(storage, selected.platform);
									setChoice(selected.platform);
								}
								window.location.assign(url);
							}}
							trigger={(trigger) => (
								<button
									{...trigger}
									type="button"
									className="lp-action lp-action-secondary lp-download-toggle"
									aria-label={t("landingPage.downloadOptions")}
								>
									<ChevronDown size={16} aria-hidden="true" />
								</button>
							)}
						/>
					</div>
				) : (
					<button
						type="button"
						className={`lp-action ${appPath ? "lp-action-secondary" : "lp-action-primary"}`}
						onClick={() => void copyLink().then((ok) => setCopyStatus(ok ? "copied" : "failed"))}
					>
						{t("landing.copyLink")}
					</button>
				)}
				<a
					className={`lp-action ${!appPath && inApp ? "lp-action-secondary" : "lp-action-primary"}`}
					href={appPath ?? catalog.web.url ?? "/messages"}
				>
					{t(appPath ? "landingPage.openApp" : "landing.useWeb")}
				</a>
			</div>
			{inApp ? (
				<span className="lp-download-note" role="status">
					{copyStatus === "copied" ? t("landing.copied") : copyStatus === "failed" ? t("landing.copyFailed") : null}
				</span>
			) : null}
		</div>
	);
}
