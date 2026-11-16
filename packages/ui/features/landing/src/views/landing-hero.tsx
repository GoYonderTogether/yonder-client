import { Avatar } from "@yonder/ui-components";
import { ArrowUp, CalendarDays, Check, Clock, LoaderCircle, MapPin, Paperclip, TrainFront } from "lucide-react";
import { type CSSProperties, type RefObject, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DownloadControls } from "./landing-download.tsx";
import { useScrollProgress } from "./use-landing-motion.ts";

/** Chores drifting round the chat at three depths; each is pulled into the composer as you scroll. */
const TAGS = [
	{ key: "poster", left: 4, top: 14, z: 1 },
	{ key: "recording", left: 78, top: 8, z: 0.6 },
	{ key: "refund", left: 84, top: 48, z: 1 },
	{ key: "parcel", left: 72, top: 82, z: 0.4 },
	{ key: "invoice", left: 2, top: 70, z: 0.6 },
	{ key: "subtitle", left: 10, top: 42, z: 0.4 },
] as const;

const STEPS = ["step1", "step2", "step3"] as const;

/** Each tag's offset to the composer, so the scroll can pull it in from wherever it sits. */
function useTagTargets(stage: RefObject<HTMLDivElement | null>) {
	useLayoutEffect(() => {
		const element = stage.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const measure = () => {
			const target = element.querySelector<HTMLElement>(".lp-composer");
			if (!target) return;
			const box = element.getBoundingClientRect();
			const goal = target.getBoundingClientRect();
			const cx = goal.left - box.left + goal.width * 0.35;
			const cy = goal.top - box.top + goal.height / 2;
			for (const tag of element.querySelectorAll<HTMLElement>(".lp-tag")) {
				const x = tag.offsetLeft + tag.offsetWidth / 2;
				const y = tag.offsetTop + tag.offsetHeight / 2;
				tag.style.setProperty("--dx", `${Math.round(cx - x)}px`);
				tag.style.setProperty("--dy", `${Math.round(cy - y)}px`);
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [stage]);
}

/** The opening: the promise, the actions, then the chat pinned while it finishes one chore. */
export function HeroSection({ version, iosUrl }: { version: string; iosUrl?: string | undefined }) {
	const { t } = useTranslation();
	const track = useRef<HTMLElement>(null);
	const stage = useRef<HTMLDivElement>(null);
	useScrollProgress(track);
	useTagTargets(stage);

	return (
		<>
			<section className="lp-container lp-hero" aria-labelledby="lp-hero-title">
				<h1 id="lp-hero-title">{t("landingPage.hero.title")}</h1>
				<p className="lp-hero-lead">{t("landingPage.hero.lead")}</p>
				<DownloadControls version={version} iosUrl={iosUrl} />
			</section>

			<section ref={track} className="lp-demo lp-scrub" aria-label={t("landingPage.hero.demo")}>
				<div className="lp-demo-pin">
					<div ref={stage} className="lp-demo-stage">
						<span className="lp-demo-glow" aria-hidden="true" />
						<ul className="lp-tags" aria-hidden="true">
							{TAGS.map(({ key, left, top, z }, index) => (
								<li
									key={key}
									className="lp-tag"
									style={{ left: `${left}%`, top: `${top}%`, "--z": z, "--i": index } as CSSProperties}
								>
									<span>{t(`landingPage.tags.${key}`)}</span>
								</li>
							))}
						</ul>

						<div className="lp-chat">
							<div className="lp-chat-head">
								<Avatar name={t("landingPage.console.bot")} kind="bot" face={1} size={36} />
								<span className="lp-chat-title">
									<span className="lp-chat-name">{t("landingPage.console.bot")}</span>
									<span className="lp-chat-state">
										<span className="lp-chat-busy">
											<LoaderCircle size={12} aria-hidden="true" className="lp-spin" />
											{t("landingPage.console.working")}
										</span>
										<span className="lp-chat-fin">
											<Check size={12} aria-hidden="true" />
											{t("landingPage.console.done")}
										</span>
									</span>
								</span>
							</div>

							<div className="lp-chat-body">
								<p className="lp-bubble lp-bubble-in">{t("landingPage.console.earlier")}</p>
								<p className="lp-bubble lp-bubble-out lp-ask">{t("landingPage.console.ask")}</p>
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
								<p className="lp-bubble lp-bubble-in lp-reply">{t("landingPage.console.reply")}</p>
							</div>

							<div className="lp-composer" aria-hidden="true">
								<Paperclip size={18} />
								<span className="lp-composer-field">
									<span className="lp-composer-hint">{t("landingPage.hero.composer")}</span>
									<span className="lp-composer-text">{t("landingPage.console.ask")}</span>
								</span>
								<span className="lp-composer-send">
									<ArrowUp size={16} />
								</span>
							</div>
						</div>
						<p className="lp-demo-hint">{t("landingPage.hero.scroll")}</p>
					</div>
				</div>
			</section>
		</>
	);
}
