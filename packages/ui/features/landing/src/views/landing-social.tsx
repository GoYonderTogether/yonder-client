import { Avatar, BrandedQrCode } from "@yonder/ui-components";
import { AudioLines, RotateCw, ScanQrCode, Users } from "lucide-react";
import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** Clues on the private face, placed round "me" on a 320 × 200 canvas. */
const NODES = [
	{ key: "a", x: 70, y: 46 },
	{ key: "b", x: 252, y: 40 },
	{ key: "c", x: 262, y: 156 },
	{ key: "d", x: 62, y: 152 },
] as const;

function MemoryGraph() {
	const { t } = useTranslation();
	return (
		<svg className="lp-graph" viewBox="0 0 320 200" role="img" aria-label={t("landingPage.card.graphLabel")}>
			{NODES.map(({ key, x, y }, index) => (
				<path
					key={key}
					className="lp-graph-edge"
					d={`M160 100 Q ${(160 + x) / 2} ${y < 100 ? y + 30 : y - 30} ${x} ${y}`}
					pathLength={1}
					style={{ "--i": index } as CSSProperties}
				/>
			))}
			<circle className="lp-graph-me" cx="160" cy="100" r="22" />
			<text className="lp-graph-me-text" x="160" y="104" textAnchor="middle">
				{t("landingPage.card.name")}
			</text>
			{NODES.map(({ key, x, y }, index) => (
				<g key={key} className="lp-graph-node" style={{ "--i": index } as CSSProperties}>
					<circle cx={x} cy={y} r="4" />
					<text x={x} y={y < 100 ? y - 12 : y + 20} textAnchor="middle">
						{t(`landingPage.card.nodes.${key}`)}
					</text>
				</g>
			))}
		</svg>
	);
}

/**
 * The two-sided card. It leans toward a fine pointer with a soft sheen following it; a tap flips
 * it to the private face, where the AI's clues draw themselves round you.
 */
export function CardSection() {
	const { t } = useTranslation();
	const [flipped, setFlipped] = useState(false);
	const stage = useRef<HTMLDivElement>(null);
	const link = typeof window === "undefined" ? "/download" : `${window.location.origin}/download`;

	const lean = (event: PointerEvent<HTMLDivElement>) => {
		const element = stage.current;
		if (!element || event.pointerType !== "mouse") return;
		const box = element.getBoundingClientRect();
		const x = (event.clientX - box.left) / box.width;
		const y = (event.clientY - box.top) / box.height;
		element.style.setProperty("--rx", `${((0.5 - y) * 10).toFixed(2)}deg`);
		element.style.setProperty("--ry", `${((x - 0.5) * 14).toFixed(2)}deg`);
		element.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
		element.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
	};
	const rest = () => {
		const element = stage.current;
		if (!element) return;
		for (const name of ["--rx", "--ry", "--gx", "--gy"]) element.style.removeProperty(name);
	};

	return (
		<section id="card" className="lp-section lp-section-grey" aria-labelledby="lp-card-title">
			<div className="lp-container lp-split">
				<div className="lp-split-copy" data-reveal>
					<h2 id="lp-card-title">{t("landingPage.card.title")}</h2>
					<p>{t("landingPage.card.lead")}</p>
					<button
						type="button"
						className="lp-action lp-action-secondary lp-action-small lp-on-grey"
						aria-pressed={flipped}
						onClick={() => setFlipped((value) => !value)}
					>
						<RotateCw size={16} aria-hidden="true" />
						{t("landingPage.card.flip")}
					</button>
				</div>
				<div ref={stage} className="lp-card-stage" data-reveal onPointerMove={lean} onPointerLeave={rest}>
					<div className="lp-card-tilt">
						<div className="lp-card" data-flipped={flipped || undefined}>
							<section
								className="lp-card-face lp-card-front"
								aria-label={t("landingPage.card.frontLabel")}
								aria-hidden={flipped}
							>
								<span className="lp-card-sheen" aria-hidden="true" />
								<span className="lp-card-label">{t("landingPage.card.frontLabel")}</span>
								<div className="lp-card-top">
									<Avatar name={t("landingPage.card.name")} color="3" size={64} />
									<div>
										<h3>{t("landingPage.card.name")}</h3>
										<p>{t("landingPage.card.role")}</p>
									</div>
								</div>
								<ul className="lp-card-chips">
									<li>{t("landingPage.card.chips.a")}</li>
									<li>{t("landingPage.card.chips.b")}</li>
									<li>{t("landingPage.card.chips.c")}</li>
								</ul>
								<div className="lp-card-qr">
									<p>
										<ScanQrCode size={16} aria-hidden="true" />
										{t("landingPage.card.scan")}
									</p>
									<BrandedQrCode value={link} label={t("landingPage.card.qr")} size={96} />
								</div>
							</section>
							<section
								className="lp-card-face lp-card-back"
								aria-label={t("landingPage.card.backLabel")}
								aria-hidden={!flipped}
							>
								<span className="lp-card-label">{t("landingPage.card.backLabel")}</span>
								<MemoryGraph />
								<ul>
									<li>{t("landingPage.card.back1")}</li>
									<li>{t("landingPage.card.back2")}</li>
									<li>{t("landingPage.card.back3")}</li>
								</ul>
								<p className="lp-card-note">{t("landingPage.card.backNote")}</p>
							</section>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

/** Guests round the event on a 360 × 220 canvas; the last one is the person worth a second talk. */
const GUESTS = [
	{ x: 52, y: 54 },
	{ x: 40, y: 150 },
	{ x: 120, y: 196 },
	{ x: 236, y: 196 },
	{ x: 316, y: 158 },
	{ x: 306, y: 50 },
] as const;

function EventNetwork() {
	const { t } = useTranslation();
	return (
		<svg className="lp-net" viewBox="0 0 360 230" role="img" aria-label={t("landingPage.events.network")}>
			<circle className="lp-net-ring" cx="180" cy="112" r="64" pathLength={1} />
			<circle className="lp-net-ring lp-net-ring-b" cx="180" cy="112" r="96" pathLength={1} />
			{GUESTS.map(({ x, y }, index) => (
				<path
					key={`${x}-${y}`}
					className="lp-net-edge"
					d={`M180 112 L${x} ${y}`}
					pathLength={1}
					style={{ "--i": index } as CSSProperties}
				/>
			))}
			<path className="lp-net-match" d="M180 112 Q 268 70 306 50" pathLength={1} />
			{GUESTS.map(({ x, y }, index) => (
				<circle
					key={`${x}:${y}`}
					className={index === GUESTS.length - 1 ? "lp-net-node lp-net-node-match" : "lp-net-node"}
					cx={x}
					cy={y}
					r={index === GUESTS.length - 1 ? 9 : 7}
					style={{ "--i": index } as CSSProperties}
				/>
			))}
			<circle className="lp-net-hub" cx="180" cy="112" r="18" />
			<text className="lp-net-hub-text" x="180" y="116" textAnchor="middle">
				Bot
			</text>
			<text className="lp-net-label" x="306" y="28" textAnchor="middle">
				{t("landingPage.events.match")}
			</text>
		</svg>
	);
}

const EVENT_STEPS = ["step1", "step2", "step3"] as const;

/** A pop-up group for one event: the event Bot records, your Bot finds who is worth a second talk. */
export function EventsSection() {
	const { t } = useTranslation();
	return (
		<section id="events" className="lp-section" aria-labelledby="lp-events-title">
			<div className="lp-container">
				<header className="lp-head" data-reveal>
					<h2 id="lp-events-title">{t("landingPage.events.title")}</h2>
					<p>{t("landingPage.events.lead")}</p>
				</header>
				<div className="lp-events">
					<figure className="lp-group" data-reveal aria-label={t("landingPage.events.chat")}>
						<div className="lp-group-head">
							<Users size={18} aria-hidden="true" />
							<span className="lp-group-name">{t("landingPage.events.group")}</span>
							<span className="lp-group-count">{t("landingPage.events.members")}</span>
						</div>
						<ol className="lp-group-feed">
							<li className="lp-line">
								<Avatar name={t("landingPage.events.eventBot")} kind="bot" face={2} color="1" size={36} />
								<div>
									<span className="lp-line-who">
										{t("landingPage.events.eventBot")}
										<span className="lp-wave" title={t("landingPage.events.live")}>
											<AudioLines size={14} aria-hidden="true" />
											<span className="lp-visually-hidden">{t("landingPage.events.live")}</span>
										</span>
									</span>
									<p>{t("landingPage.events.msg1")}</p>
								</div>
							</li>
							<li className="lp-line">
								<Avatar name={t("landingPage.events.guest")} color="5" size={36} />
								<div>
									<span className="lp-line-who">{t("landingPage.events.guest")}</span>
									<p>{t("landingPage.events.msg2")}</p>
								</div>
							</li>
							<li className="lp-line lp-line-mine">
								<Avatar name={t("landingPage.events.yourBot")} kind="bot" face={1} size={36} />
								<div>
									<span className="lp-line-who">{t("landingPage.events.yourBot")}</span>
									<p>{t("landingPage.events.msg3")}</p>
								</div>
							</li>
						</ol>
					</figure>
					<div className="lp-events-side">
						<figure className="lp-net-wrap" data-reveal>
							<EventNetwork />
						</figure>
						<ol className="lp-event-steps">
							{EVENT_STEPS.map((step, index) => (
								<li key={step} data-reveal style={{ "--i": index } as CSSProperties}>
									<span className="lp-event-index" aria-hidden="true">
										{index + 1}
									</span>
									<h3>{t(`landingPage.events.${step}.title`)}</h3>
									<p>{t(`landingPage.events.${step}.body`)}</p>
								</li>
							))}
						</ol>
					</div>
				</div>
			</div>
		</section>
	);
}
