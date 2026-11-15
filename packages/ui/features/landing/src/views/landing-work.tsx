import { CalendarDays, Check, Coins, Film, Hand, Hourglass, ListChecks, Mic, Receipt, Sunrise } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

const CHORES = [
	{ key: "poster", Icon: CalendarDays },
	{ key: "recording", Icon: Mic },
	{ key: "refund", Icon: Receipt },
	{ key: "subtitle", Icon: Film },
	{ key: "brief", Icon: Sunrise },
] as const;

/** Five everyday chores, each a slip that turns from "to do" into "done" as it scrolls in. */
export function ChoresSection() {
	const { t } = useTranslation();
	return (
		<section id="chores" className="lp-section" aria-labelledby="lp-chores-title">
			<div className="lp-container">
				<header className="lp-head" data-reveal>
					<h2 id="lp-chores-title">{t("landingPage.chores.title")}</h2>
					<p>{t("landingPage.chores.lead")}</p>
				</header>
				<ol className="lp-chores">
					{CHORES.map(({ key, Icon }, index) => (
						<li key={key} className="lp-chore" data-reveal style={{ "--i": index } as CSSProperties}>
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

/** One task laid open: its steps, the question it is waiting on, what it cost, when it looks again. */
export function ControlSection() {
	const { t } = useTranslation();
	return (
		<section id="control" className="lp-section lp-section-dark" aria-labelledby="lp-control-title">
			<div className="lp-container lp-split">
				<div className="lp-split-copy" data-reveal>
					<h2 id="lp-control-title">{t("landingPage.control.title")}</h2>
					<p>{t("landingPage.control.lead")}</p>
					<ul className="lp-principles">
						{PRINCIPLES.map(({ key, Icon }) => (
							<li key={key}>
								<Icon size={18} aria-hidden="true" />
								<span>
									<strong>{t(`landingPage.control.principles.${key}.title`)}</strong>
									{t(`landingPage.control.principles.${key}.body`)}
								</span>
							</li>
						))}
					</ul>
				</div>
				<figure className="lp-task" data-reveal aria-label={t("landingPage.control.task")}>
					<div className="lp-task-head">
						<span className="lp-task-title">{t("landingPage.control.task")}</span>
						<span className="lp-task-state">{t("landingPage.control.running")}</span>
					</div>
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
					<dl className="lp-task-meta">
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
		</section>
	);
}
