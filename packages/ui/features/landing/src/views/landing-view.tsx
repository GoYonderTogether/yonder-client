import { Logo } from "@yonder/ui-components";
import { useLocalePreference } from "@yonder/ui-data";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { LandingConsole } from "./landing-console.tsx";
import { DownloadControls } from "./landing-download.tsx";
import { BotsSection, CardSection, EventsSection } from "./landing-social.tsx";
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
			<div className="lp-light" aria-hidden="true">
				<span className="lp-sun lp-sun-a" />
				<span className="lp-sun lp-sun-b" />
				<span className="lp-window" />
			</div>

			<header className="lp-nav">
				<div className="lp-container lp-nav-inner">
					<a className="lp-wordmark" href="/" aria-label={t("landing.backHome")}>
						<Logo size={28} fit="text" />
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
						<a className="lp-action lp-action-primary lp-action-small" href="#get">
							{t("landingPage.nav.download")}
						</a>
					</div>
				</div>
			</header>

			<main>
				<section className="lp-container lp-hero" data-hero aria-labelledby="lp-hero-title">
					<div className="lp-hero-copy">
						<h1 id="lp-hero-title">
							<span>{t("landingPage.hero.titleA")}</span>
							<span>{t("landingPage.hero.titleB")}</span>
						</h1>
						<p className="lp-hero-lead">{t("landingPage.hero.lead")}</p>
						<DownloadControls version={version} iosUrl={iosUrl} />
					</div>
					<LandingConsole />
				</section>

				<ChoresSection />
				<ControlSection />
				<BotsSection />
				<CardSection />
				<EventsSection />

				<section id="get" className="lp-closing" aria-labelledby="lp-get-title">
					<div className="lp-container lp-closing-inner" data-reveal>
						<h2 id="lp-get-title">{t("landingPage.closing.title")}</h2>
						<p className="lp-closing-lead">{t("landingPage.closing.lead")}</p>
						<div className="lp-actions">
							<a className="lp-action lp-action-primary" href="/download">
								{t("landingPage.closing.get")}
							</a>
							<a className="lp-action lp-action-secondary" href="/sign-in">
								{t("landingPage.closing.signIn")}
							</a>
						</div>
					</div>
				</section>
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
						<span>{t("landingPage.footer.scenes")}</span>
					</div>
				</div>
			</footer>
		</div>
	);
}
