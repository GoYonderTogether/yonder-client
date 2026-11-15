import { useTranslation } from "react-i18next";
import { createDownloadCatalog } from "../downloads.ts";
import type { DownloadPlatform } from "../environment.ts";
import { PublicLayout, type PublicViewProps } from "./public-layout.tsx";
import "./downloads.css";

const PLATFORMS: DownloadPlatform[] = ["macos", "windows", "android", "ios", "web"];

export function DownloadView({ version, iosUrl }: PublicViewProps) {
	const { t } = useTranslation();
	const catalog = createDownloadCatalog(version, {
		...(iosUrl ? { iosUrl } : {}),
	});

	return (
		<PublicLayout homeLink>
			<main className="downloads-main">
				<h1>{t("landing.allDownloads")}</h1>
				<div className="downloads-list">
					{PLATFORMS.map((platform) => {
						const entry = catalog[platform];
						const name = t(`landing.platforms.${platform}`);
						return (
							<section className="downloads-row" key={platform} aria-label={name}>
								<div>
									<h2>{name}</h2>
									<div className="downloads-meta">
										{entry.version ? <span>{t("landing.version", { version: entry.version })}</span> : null}
										{platform === "macos" ? <span>{t("landing.macRequirement")}</span> : null}
										{platform === "windows" ? <span>{t("landing.windowsRequirement")}</span> : null}
									</div>
									{platform === "macos" ? <p>{t("landing.macNote")}</p> : null}
									{platform === "windows" ? <p>{t("landing.windowsNote")}</p> : null}
								</div>
								{entry.url ? (
									<a className="public-action public-action-secondary" href={entry.url}>
										{platform === "web" ? t("landing.useWeb") : t("landing.downloadFor", { platform: name })}
									</a>
								) : (
									<span className="downloads-unavailable">{t("landing.unavailable")}</span>
								)}
							</section>
						);
					})}
				</div>
			</main>
		</PublicLayout>
	);
}
