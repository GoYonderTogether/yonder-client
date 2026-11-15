import { BotFace } from "@yonder/ui-components";
import { CalendarDays, Check, Clock, LoaderCircle, MapPin, TrainFront } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

const STEPS = ["step1", "step2", "step3"] as const;
const TAGS = ["poster", "recording", "refund", "parcel", "invoice", "subtitle"] as const;

/**
 * The hero's signature: a machined console finishing one chore. The sequence is CSS-only, so it
 * plays without scripting and lands on its finished state under reduced motion.
 */
export function LandingConsole() {
	const { t } = useTranslation();
	return (
		<figure className="lp-stage" aria-label={t("landingPage.hero.demo")}>
			<ul className="lp-tags" aria-hidden="true">
				{TAGS.map((tag, index) => (
					<li key={tag} className="lp-tag" style={{ "--i": index } as CSSProperties}>
						{t(`landingPage.tags.${tag}`)}
					</li>
				))}
			</ul>
			<div className="lp-console">
				<div className="lp-console-bar">
					<span className="lp-console-face">
						<BotFace id={1} size={22} />
					</span>
					<span className="lp-console-name">{t("landingPage.console.bot")}</span>
					<span className="lp-console-state">
						<LoaderCircle size={14} aria-hidden="true" className="lp-spin" />
						{t("landingPage.console.working")}
					</span>
				</div>
				<div className="lp-console-body">
					<p className="lp-msg lp-msg-you">{t("landingPage.console.ask")}</p>
					<ol className="lp-steps">
						{STEPS.map((step, index) => (
							<li key={step} className="lp-step" style={{ "--i": index } as CSSProperties}>
								<span className="lp-step-mark" aria-hidden="true">
									<LoaderCircle size={14} className="lp-step-wait" />
									<Check size={14} className="lp-step-done" />
								</span>
								{t(`landingPage.console.${step}`)}
							</li>
						))}
					</ol>
					<div className="lp-result">
						<div className="lp-result-head">
							<CalendarDays size={16} aria-hidden="true" />
							<span>{t("landingPage.console.resultTitle")}</span>
							<span className="lp-result-place">
								<MapPin size={13} aria-hidden="true" />
								{t("landingPage.hero.place")}
							</span>
						</div>
						<dl className="lp-result-rows">
							<div>
								<dt>
									<Clock size={14} aria-hidden="true" />
								</dt>
								<dd>{t("landingPage.console.resultStart")}</dd>
							</div>
							<div>
								<dt>
									<TrainFront size={14} aria-hidden="true" />
								</dt>
								<dd>{t("landingPage.console.resultLeave")}</dd>
							</div>
						</dl>
						<p className="lp-result-foot">{t("landingPage.console.resultRemind")}</p>
					</div>
					<p className="lp-msg lp-msg-bot">{t("landingPage.console.reply")}</p>
				</div>
				<span className="lp-console-scan" aria-hidden="true" />
			</div>
		</figure>
	);
}
