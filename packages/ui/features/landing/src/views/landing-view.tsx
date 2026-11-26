import { AmbientField, IconButton, Logo, Menu } from "@yonder/ui-components";
import { useLocalePreference } from "@yonder/ui-data";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { Globe } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { BotsSection } from "./landing-bots.tsx";
import { ClosingSection } from "./landing-closing.tsx";
import { HeroSection } from "./landing-hero.tsx";
import { CardSection, EventsSection } from "./landing-social.tsx";
import { StorySection } from "./landing-story.tsx";
import { ChoresSection, ControlSection } from "./landing-work.tsx";
import type { PublicViewProps } from "./public-layout.tsx";
import { useLandingMotion } from "./use-landing-motion.ts";
import "./landing.css";

const SECTIONS = ["chores", "control", "bots", "card", "events"] as const;

export function LandingView({ version, iosUrl, appPath }: PublicViewProps & { appPath: string | null }) {
	const { t } = useTranslation();
	const { setLocale } = useLocalePreference();
	const root = useRef<HTMLDivElement>(null);
	useLandingMotion(root);
	const language = t("common.language");

	return (
		<div className="lp" ref={root}>
			<AmbientField />
			<div className="lp-field" aria-hidden="true">
				<span className="lp-dots" />
				<span className="lp-dots-lit" />
			</div>
			<header className="lp-nav">
				<div className={appPath ? "lp-container lp-nav-inner lp-nav-signed-in" : "lp-container lp-nav-inner"}>
					<a className="lp-wordmark" href="/" aria-label={t("landing.backHome")}>
						<Logo size={24} fit="text" />
						<span>{t("app.name")}</span>
					</a>
					<nav aria-label={t("landingPage.nav.label")}>
						<ul className="lp-nav-links">
							{SECTIONS.map((section) => (
								<li key={section}>
									<a href={`#${section}`}>{t(`landingPage.nav.${section}`)}</a>
								</li>
							))}
						</ul>
					</nav>
					<div className="lp-nav-tools">
						<Menu
							label={language}
							items={[
								{ id: "zh-CN", label: t("common.locale.zhCN") },
								{ id: "en", label: t("common.locale.en") },
							]}
							onSelect={(id) => {
								if (id === "zh-CN" || id === "en") setLocale(id);
							}}
							trigger={(props) => (
								<IconButton {...props} aria-label={language} size="sm">
									<Globe className="text-[var(--lp-ink-2)]" size={ICON_SIZE.md} aria-hidden="true" />
								</IconButton>
							)}
						/>
						<a
							className={appPath ? "lp-action lp-action-primary lp-action-small" : "lp-nav-signin"}
							href={appPath ?? "/sign-in"}
						>
							{t(appPath ? "landingPage.openApp" : "landingPage.nav.signIn")}
						</a>
						<a
							className={`lp-action lp-action-small ${appPath ? "lp-action-secondary" : "lp-action-primary"}`}
							href="/download"
						>
							{t("landingPage.nav.download")}
						</a>
					</div>
				</div>
			</header>

			<main>
				<HeroSection version={version} iosUrl={iosUrl} appPath={appPath} />
				<StorySection />

				<ChoresSection />
				<ControlSection />
				<BotsSection />
				<CardSection />
				<EventsSection />

				<ClosingSection appPath={appPath} />
			</main>

			<footer className="lp-footer">
				<div className="lp-container">
					<div className="lp-footer-grid">
						<div className="lp-footer-brand">
							<span className="lp-wordmark">
								<Logo size={24} fit="text" />
								<span>{t("app.name")}</span>
							</span>
							<p>{t("landingPage.footer.company")}</p>
						</div>
						<nav aria-labelledby="lp-footer-product">
							<h2 id="lp-footer-product">{t("landingPage.footer.product")}</h2>
							<ul>
								<li>
									<a href="/download">{t("landingPage.footer.download")}</a>
								</li>
								{!appPath && (
									<li>
										<a href="/messages">{t("landingPage.footer.web")}</a>
									</li>
								)}
								<li>
									<a href={appPath ?? "/sign-in"}>{t(appPath ? "landingPage.openApp" : "landingPage.footer.signIn")}</a>
								</li>
							</ul>
						</nav>
						<nav aria-labelledby="lp-footer-legal">
							<h2 id="lp-footer-legal">{t("landingPage.footer.legal")}</h2>
							<ul>
								<li>
									<a href="/terms">{t("landingPage.footer.terms")}</a>
								</li>
								<li>
									<a href="/privacy">{t("landingPage.footer.privacy")}</a>
								</li>
							</ul>
						</nav>
					</div>
					<div className="lp-footer-base">
						<span>
							© {new Date().getFullYear()} {t("app.name")}
						</span>
						{window.location.hostname === "yonderbot.net" ? (
							<a className="underline" href="https://beian.miit.gov.cn/">
								{t("landingPage.footer.icp", { number: "鄂ICP备2026027205号-2" })}
							</a>
						) : null}
						<span>{t("landingPage.footer.scenes")}</span>
					</div>
				</div>
			</footer>
		</div>
	);
}
