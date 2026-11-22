import { Button, Menu } from "@yonder/ui-components";
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

/**
 * The hero's actions: the installer and the app, with extra platform choices for guests.
 * In an in-app browser (WeChat, QQ…) no installer link is ever rendered; it offers to copy the link.
 */
export function DownloadControls({ version, iosUrl, appPath }: PublicViewProps & { appPath: string | null }) {
	const { t } = useTranslation();
	const { storage } = useData();
	const [environment] = useState(() => detectEnvironment(navigator.userAgent, navigator.maxTouchPoints));
	const [choice, setChoice] = useState(() => readPlatformChoice(storage));
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
	const catalog = createDownloadCatalog(version, { ...(iosUrl ? { iosUrl } : {}) });
	const platform = choice ?? (environment.type === "browser" ? environment.platform : "web");
	const download = environment.type === "browser" && platform !== "web" ? catalog[platform].url : null;
	const note = platform === "macos" ? t("landing.macNote") : platform === "windows" ? t("landing.windowsNote") : null;
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
				{appPath && !inApp ? (
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
							onSelect={(url) => window.location.assign(url)}
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
				) : inApp ? (
					<button
						type="button"
						className={`lp-action ${appPath ? "lp-action-secondary" : "lp-action-primary"}`}
						onClick={() => void copyLink().then((ok) => setCopyStatus(ok ? "copied" : "failed"))}
					>
						{t("landing.copyLink")}
					</button>
				) : download ? (
					<a className="lp-action lp-action-primary" href={download}>
						{t("landing.downloadFor", { platform: t(`landing.platforms.${platform}`) })}
					</a>
				) : null}
				<a
					className={`lp-action ${!appPath && (download || inApp) ? "lp-action-secondary" : "lp-action-primary"}`}
					href={appPath ?? catalog.web.url ?? "/messages"}
				>
					{t(appPath ? "landingPage.openApp" : "landing.useWeb")}
				</a>
			</div>
			{!appPath && download && note ? <p className="lp-download-note">{note}</p> : null}
			{inApp ? (
				<span className="lp-download-note" role="status">
					{copyStatus === "copied" ? t("landing.copied") : copyStatus === "failed" ? t("landing.copyFailed") : null}
				</span>
			) : null}
			{!appPath && (
				<div className="lp-download-links">
					<a href="/download">{t("landing.allDownloads")}</a>
					<details>
						<summary>{t("landing.choosePlatform")}</summary>
						<div className="lp-platforms">
							{PLATFORMS.map((item) => (
								<Button
									key={item}
									variant={item === platform ? "secondary" : "ghost"}
									size="sm"
									aria-pressed={item === platform}
									onClick={() => {
										writePlatformChoice(storage, item);
										setChoice(item);
									}}
								>
									{t(`landing.platforms.${item}`)}
								</Button>
							))}
						</div>
					</details>
				</div>
			)}
		</div>
	);
}
