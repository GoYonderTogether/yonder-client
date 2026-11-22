import { AmbientField, Logo } from "@yonder/ui-components";
import { useLocalePreference } from "@yonder/ui-data";
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

export function LandingView({ version, iosUrl }: PublicViewProps) {
	const { t } = useTranslation();
	const { locale, setLocale } = useLocalePreference();
	const root = useRef<HTMLDivElement>(null);
	useLandingMotion(root);
	const other = locale === "zh-CN" ? "en" : "zh-CN";

	return (
		<div className="lp" ref={root}>
			<AmbientField />
			<div className="lp-field" aria-hidden="true">
				<span className="lp-dots" />
				<span className="lp-dots-lit" />
			</div>
			<header className="lp-nav">
				<div className="lp-container lp-nav-inner">
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
						<button type="button" lang={other} onClick={() => setLocale(other)}>
							{other === "en" ? t("common.locale.en") : t("common.locale.zhCN")}
						</button>
						<a className="lp-nav-signin" href="/sign-in">
							{t("landingPage.nav.signIn")}
						</a>
						<a className="lp-action lp-action-primary lp-action-small" href="/download">
							{t("landingPage.nav.download")}
						</a>
					</div>
				</div>
			</header>

			<main>
				<HeroSection version={version} iosUrl={iosUrl} />
				<StorySection />

				<ChoresSection />
				<ControlSection />
				<BotsSection />
				<CardSection />
				<EventsSection />

				<ClosingSection />
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
								<li>
									<a href="/messages">{t("landingPage.footer.web")}</a>
								</li>
								<li>
									<a href="/sign-in">{t("landingPage.footer.signIn")}</a>
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
