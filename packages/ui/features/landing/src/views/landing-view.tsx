import { Button, Logo } from "@yonder/ui-components";
import { useData } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createDownloadCatalog } from "../downloads.ts";
import type { DownloadPlatform } from "../environment.ts";
import { detectEnvironment, readPlatformChoice, writePlatformChoice } from "../environment.ts";
import { PublicLayout, type PublicViewProps } from "./public-layout.tsx";

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

export function LandingView({ version, iosUrl }: PublicViewProps) {
	const { t } = useTranslation();
	const { storage } = useData();
	const [environment] = useState(() => detectEnvironment(navigator.userAgent, navigator.maxTouchPoints));
	const [choice, setChoice] = useState(() => readPlatformChoice(storage));
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
	const catalog = createDownloadCatalog(version, {
		...(iosUrl ? { iosUrl } : {}),
	});
	const platform = choice ?? (environment.type === "browser" ? environment.platform : "web");
	const download = environment.type === "browser" && platform !== "web" ? catalog[platform].url : null;
	const note = platform === "macos" ? t("landing.macNote") : platform === "windows" ? t("landing.windowsNote") : null;

	return (
		<PublicLayout>
			<main className="landing-main">
				<div className="landing-hero">
					<div className="landing-brand">
						<Logo size={64} />
						<h1>{t("app.name")}</h1>
					</div>
					<div className="landing-controls">
						{environment.type === "in-app" ? (
							<p className="landing-hint">{t("landing.inApp", { app: t(`landing.apps.${environment.app}`) })}</p>
						) : null}
						<div className="landing-actions">
							{environment.type === "in-app" ? (
								<Button
									variant="primary"
									size="lg"
									onClick={() => void copyLink().then((ok) => setCopyStatus(ok ? "copied" : "failed"))}
								>
									{t("landing.copyLink")}
								</Button>
							) : download ? (
								<a className="public-action public-action-primary" href={download}>
									{t("landing.downloadFor", { platform: t(`landing.platforms.${platform}`) })}
								</a>
							) : null}
							<a
								className={`public-action ${download || environment.type === "in-app" ? "public-action-secondary" : "public-action-primary"}`}
								href={catalog.web.url ?? "/messages"}
							>
								{t("landing.useWeb")}
							</a>
						</div>
						{download && note ? <p className="landing-note">{note}</p> : null}
						{environment.type === "in-app" ? (
							<span className="landing-note" role="status">
								{copyStatus === "copied"
									? t("landing.copied")
									: copyStatus === "failed"
										? t("landing.copyFailed")
										: null}
							</span>
						) : null}
						<div className="landing-links">
							<a href="/download">{t("landing.allDownloads")}</a>
							<details>
								<summary>{t("landing.choosePlatform")}</summary>
								<div className="platform-choices">
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
				</div>
			</main>
		</PublicLayout>
	);
}
