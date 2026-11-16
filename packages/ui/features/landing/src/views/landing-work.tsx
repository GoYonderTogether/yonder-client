import { CalendarDays, Check, Coins, Film, Hand, Hourglass, ListChecks, Mic, Receipt, Sunrise } from "lucide-react";
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoreVignette } from "./landing-art.tsx";
import { useScrollProgress } from "./use-landing-motion.ts";

const CHORES = [
	{ key: "poster", Icon: CalendarDays },
	{ key: "recording", Icon: Mic },
	{ key: "refund", Icon: Receipt },
	{ key: "subtitle", Icon: Film },
	{ key: "brief", Icon: Sunrise },
] as const;

/**
 * Five everyday chores. With motion, the section pins and the row slides sideways as you scroll,
 * each card drawing its vignette and flipping to "done" as it crosses the middle. Without it, the
 * row is a plain grid, everything drawn and done.
 */
export function ChoresSection() {
	const { t } = useTranslation();
	const track = useRef<HTMLElement>(null);
	useScrollProgress(track);
	return (
		<section ref={track} id="chores" className="lp-section lp-chores-track" aria-labelledby="lp-chores-title">
			<div className="lp-chores-pin">
				<div className="lp-container">
					<header className="lp-head" data-reveal>
						<h2 id="lp-chores-title">{t("landingPage.chores.title")}</h2>
						<p>{t("landingPage.chores.lead")}</p>
					</header>
				</div>
				<ol className="lp-chores" style={{ "--n": CHORES.length } as CSSProperties}>
					{CHORES.map(({ key, Icon }, index) => (
						<li key={key} className="lp-chore" style={{ "--i": index } as CSSProperties}>
							<ChoreVignette name={key} />
							<span className="lp-chore-icon" aria-hidden="true">
								<Icon size={20} />
							</span>
							<h3>{t(`landingPage.chores.${key}.title`)}</h3>
							<p className="lp-chore-before">
								<span className="lp-chip">{t("landingPage.chores.pending")}</span>
								{t(`landingPage.chores.${key}.before`)}
							</p>
							<p className="lp-chore-after">
								<span className="lp-chip lp-chip-done">
									<Check size={12} aria-hidden="true" />
									{t("landingPage.chores.done")}
								</span>
								{t(`landingPage.chores.${key}.after`)}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

const STEPS = [
	{ key: "step1", state: "done" },
	{ key: "step2", state: "done" },
	{ key: "step3", state: "ask" },
	{ key: "step4", state: "later" },
] as const;

const PRINCIPLES = [
	{ key: "brief", Icon: ListChecks },
	{ key: "quiet", Icon: Hourglass },
	{ key: "steer", Icon: Hand },
	{ key: "ledger", Icon: Coins },
] as const;

type Principle = (typeof PRINCIPLES)[number]["key"];

/** Which principle sits at the middle of the viewport; null until one does. */
function useActivePrinciple(list: RefObject<HTMLOListElement | null>) {
	const [active, setActive] = useState<Principle | null>(null);
	useEffect(() => {
		const element = list.current;
		if (!element || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActive((entry.target as HTMLElement).dataset.key as Principle);
				}
			},
			{ rootMargin: "-45% 0px -45% 0px" },
		);
		for (const item of element.querySelectorAll("li")) observer.observe(item);
		return () => observer.disconnect();
	}, [list]);
	return active;
}

/**
 * One task laid open. The panel stays pinned while the four principles scroll past; the one at the
 * middle of the screen lights the part of the panel it is about. Without motion every part is lit.
 */
export function ControlSection() {
	const { t } = useTranslation();
	const list = useRef<HTMLOListElement>(null);
	const active = useActivePrinciple(list);
	return (
		<section id="control" className="lp-section lp-section-grey" aria-labelledby="lp-control-title">
			<div className="lp-container lp-diptych" data-focus={active ?? undefined}>
				<div className="lp-diptych-copy">
					<header className="lp-head" data-reveal>
						<h2 id="lp-control-title">{t("landingPage.control.title")}</h2>
						<p>{t("landingPage.control.lead")}</p>
					</header>
					<ol ref={list} className="lp-principles">
						{PRINCIPLES.map(({ key, Icon }) => (
							<li key={key} data-key={key} data-on={active === key || undefined}>
								<span className="lp-principle-icon" aria-hidden="true">
									<Icon size={20} />
								</span>
								<h3>{t(`landingPage.control.principles.${key}.title`)}</h3>
								<p>{t(`landingPage.control.principles.${key}.body`)}</p>
							</li>
						))}
					</ol>
				</div>
				<div className="lp-diptych-pane">
					<figure className="lp-task" aria-label={t("landingPage.control.task")}>
						<div className="lp-task-head">
							<span className="lp-task-title">{t("landingPage.control.task")}</span>
							<span className="lp-task-state">{t("landingPage.control.running")}</span>
						</div>
						<p className="lp-task-summary" data-part="brief">
							{t("landingPage.control.summary")}
						</p>
						<ol className="lp-task-steps">
							{STEPS.map(({ key, state }) => (
								<li key={key} data-state={state}>
									<span className="lp-task-mark" aria-hidden="true">
										{state === "done" ? <Check size={14} /> : state === "ask" ? <Hand size={14} /> : null}
									</span>
									{t(`landingPage.control.${key}`)}
								</li>
							))}
						</ol>
						<p className="lp-task-offline" data-part="quiet">
							<Hourglass size={14} aria-hidden="true" />
							{t("landingPage.control.offline")}
						</p>
						<div className="lp-task-controls" data-part="steer" aria-hidden="true">
							<span>{t("landingPage.control.pause")}</span>
							<span>{t("landingPage.control.change")}</span>
						</div>
						<dl className="lp-task-meta" data-part="ledger">
							<div>
								<dt>{t("landingPage.control.cost")}</dt>
								<dd>{t("landingPage.control.costValue")}</dd>
							</div>
							<div>
								<dt>{t("landingPage.control.next")}</dt>
								<dd>{t("landingPage.control.nextValue")}</dd>
							</div>
						</dl>
					</figure>
				</div>
			</div>
		</section>
	);
}
