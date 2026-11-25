import { Button, Logo } from "@yonder/ui-components";
import { useLocalePreference } from "@yonder/ui-data";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./public.css";

export interface PublicViewProps {
	version: string;
	iosUrl?: string | undefined;
}

export function PublicLayout({ children, homeLink = false }: { children: ReactNode; homeLink?: boolean }) {
	const { locale, setLocale } = useLocalePreference();
	const { t } = useTranslation();

	return (
		<div className="public-page">
			<header className="public-header">
				{homeLink ? (
					<a className="public-home" href="/" aria-label={t("landing.backHome")}>
						<Logo size={24} fit="text" />
						<span>{t("app.name")}</span>
					</a>
				) : (
					<span />
				)}
				<Button
					variant="ghost"
					size="sm"
					lang={locale === "zh-CN" ? "en" : "zh-CN"}
					onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
				>
					{locale === "zh-CN" ? t("common.locale.en") : t("common.locale.zhCN")}
				</Button>
			</header>
			{children}
			<footer className="public-footer">
				© {copyrightYear()} {t("app.name")}
			</footer>
		</div>
	);
}

/**
 * The year the copyright line names. It is the product's year, not a person's calendar, so it is
 * read from the device clock on purpose — `time:device-clock`.
 */
export function copyrightYear(): number {
	// time:device-clock — the site's copyright is the build's year, not the account's.
	return new Date().getFullYear();
}
