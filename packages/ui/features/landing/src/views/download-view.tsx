import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createDownloadCatalog } from "../downloads.ts";
import type { DownloadPlatform } from "../environment.ts";
import { PublicLayout, type PublicViewProps } from "./public-layout.tsx";
import "./downloads.css";

const PLATFORMS: readonly DownloadPlatform[] = ["macos", "windows", "android", "ios", "web"];

type DownloadListProps = PublicViewProps & {
	connectorPlatforms?: readonly string[];
	renderAction?: (platform: DownloadPlatform, url: string, label: string) => ReactNode;
};

export function DownloadView({
	version,
	iosUrl,
	connectDevice = false,
	connectorPlatforms = [],
}: PublicViewProps & { connectDevice?: boolean; connectorPlatforms?: readonly string[] }) {
	const { t } = useTranslation();
	return (
		<PublicLayout homeLink>
			<main className="downloads-main">
				<h1>{t("landing.allDownloads")}</h1>
				{connectDevice ? <p>{t("landing.deviceGuide")}</p> : null}
				<DownloadList version={version} iosUrl={iosUrl} connectorPlatforms={connectDevice ? connectorPlatforms : []} />
			</main>
		</PublicLayout>
	);
}

export function DownloadList({ version, iosUrl, connectorPlatforms = [], renderAction }: DownloadListProps) {
	const { t } = useTranslation();
	const catalog = createDownloadCatalog(version, {
		...(iosUrl ? { iosUrl } : {}),
	});
	const supportsConnector = (platform: DownloadPlatform) => platform !== "web" && connectorPlatforms.includes(platform);
	const platforms = [...PLATFORMS].sort(
		(first, second) => Number(supportsConnector(second)) - Number(supportsConnector(first)),
	);

	return (
		<div className="downloads-list">
			{platforms.map((platform) => {
				const entry = catalog[platform];
				const name = t(`landing.platforms.${platform}`);
				const label = platform === "web" ? t("landing.useWeb") : t("landing.downloadFor", { platform: name });
				return (
					<section className="downloads-row" key={platform} aria-label={name}>
						<div>
							<h2>{name}</h2>
							<div className="downloads-meta">
								{supportsConnector(platform) ? <span>{t("landing.supportsConnector")}</span> : null}
								{entry.version ? <span>{t("landing.version", { version: entry.version })}</span> : null}
								{platform === "macos" ? <span>{t("landing.macRequirement")}</span> : null}
								{platform === "windows" ? <span>{t("landing.windowsRequirement")}</span> : null}
							</div>
							{platform === "macos" ? <p>{t("landing.macNote")}</p> : null}
							{platform === "windows" ? <p>{t("landing.windowsNote")}</p> : null}
						</div>
						{entry.url ? (
							(renderAction?.(platform, entry.url, label) ?? (
								<a className="public-action public-action-secondary" href={entry.url}>
									{label}
								</a>
							))
						) : (
							<span className="downloads-unavailable">{t("landing.unavailable")}</span>
						)}
					</section>
				);
			})}
		</div>
	);
}
