import { Logo } from "@yonder/ui-components";
import { Globe, Laptop, Monitor, Smartphone } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const PLATFORMS = [
	{ key: "macos", Icon: Laptop },
	{ key: "windows", Icon: Monitor },
	{ key: "android", Icon: Smartphone },
	{ key: "ios", Icon: Smartphone },
	{ key: "web", Icon: Globe },
] as const;

/**
 * The close: the real mark drawn stroke by stroke, filled, then the platforms and the actions.
 * Each path's own length is measured at runtime so the draw follows the logo's true geometry.
 */
export function ClosingSection({ appPath }: { appPath: string | null }) {
	const { t } = useTranslation();
	const mark = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = mark.current;
		if (!element) return;
		for (const path of element.querySelectorAll<SVGPathElement>("path")) {
			const length = typeof path.getTotalLength === "function" ? path.getTotalLength() : 0;
			if (length > 0) path.style.setProperty("--len", length.toFixed(1));
		}
	}, []);

	return (
		<section id="get" className="lp-closing" aria-labelledby="lp-get-title">
			<div className="lp-container lp-closing-inner" data-reveal>
				<div ref={mark} className="lp-mark" aria-hidden="true">
					<Logo size={112} fit="text" />
				</div>
				<h2 id="lp-get-title">{t("landingPage.closing.title")}</h2>
				<p className="lp-closing-lead">{t("landingPage.closing.lead")}</p>
				<ul className="lp-platform-row" aria-label={t("landingPage.closing.platforms")}>
					{PLATFORMS.map(({ key, Icon }, index) => (
						<li key={key} style={{ "--i": index } as CSSProperties}>
							<Icon size={18} aria-hidden="true" />
							{t(`landing.platforms.${key}`)}
						</li>
					))}
				</ul>
				<div className="lp-actions">
					<a className={`lp-action ${appPath ? "lp-action-secondary" : "lp-action-primary"}`} href="/download">
						{t("landingPage.closing.get")}
					</a>
					<a
						className={`lp-action ${appPath ? "lp-action-primary" : "lp-action-secondary"}`}
						href={appPath ?? "/sign-in"}
					>
						{t(appPath ? "landingPage.openApp" : "landingPage.closing.signIn")}
					</a>
				</div>
			</div>
		</section>
	);
}
