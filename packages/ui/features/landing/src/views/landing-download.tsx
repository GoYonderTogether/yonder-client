import { Button } from "@yonder/ui-components";
import { useData } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createDownloadCatalog } from "../downloads.ts";
import type { DownloadPlatform } from "../environment.ts";
import { detectEnvironment, readPlatformChoice, writePlatformChoice } from "../environment.ts";

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
 * The hero's actions: the installer for this device, the web version, and a manual platform pick.
 * In an in-app browser (WeChat, QQ…) no installer link is ever rendered; it offers to copy the link.
 */
export function DownloadControls({ version, iosUrl }: { version: string; iosUrl?: string | undefined }) {
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

	return (
		<div className="lp-download">
			{inApp ? (
				<p className="lp-download-hint">{t("landing.inApp", { app: t(`landing.apps.${environment.app}`) })}</p>
			) : null}
			<div className="lp-actions">
				{inApp ? (
					<button
						type="button"
						className="lp-action lp-action-primary"
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
					className={`lp-action ${download || inApp ? "lp-action-secondary" : "lp-action-primary"}`}
					href={catalog.web.url ?? "/messages"}
				>
					{t("landing.useWeb")}
				</a>
			</div>
			{download && note ? <p className="lp-download-note">{note}</p> : null}
			{inApp ? (
				<span className="lp-download-note" role="status">
					{copyStatus === "copied" ? t("landing.copied") : copyStatus === "failed" ? t("landing.copyFailed") : null}
				</span>
			) : null}
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
		</div>
	);
}
