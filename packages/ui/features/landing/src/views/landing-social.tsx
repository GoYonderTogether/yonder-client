import { Avatar, type BotFaceId, BrandedQrCode } from "@yonder/ui-components";
import { AudioLines, Plus, RotateCw, ScanQrCode, Users } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

const BOTS: { key: string; face: BotFaceId; color: string }[] = [
	{ key: "main", face: 1, color: "bot" },
	{ key: "travel", face: 3, color: "1" },
	{ key: "money", face: 4, color: "3" },
	{ key: "thesis", face: 5, color: "4" },
	{ key: "home", face: 6, color: "2" },
];

/** The Bot list as it looks in the app: each Bot a contact with a name, a colour and a note. */
export function BotsSection() {
	const { t } = useTranslation();
	return (
		<section id="bots" className="lp-section" aria-labelledby="lp-bots-title">
			<div className="lp-container lp-split lp-split-flip">
				<div className="lp-split-copy" data-reveal>
					<h2 id="lp-bots-title">{t("landingPage.bots.title")}</h2>
					<p>{t("landingPage.bots.lead")}</p>
				</div>
				<figure className="lp-bots" data-reveal aria-label={t("landingPage.bots.list")}>
					<ul>
						{BOTS.map(({ key, face, color }, index) => (
							<li key={key} className="lp-bot" style={{ "--i": index } as CSSProperties}>
								<Avatar
									name={t(`landingPage.bots.${key}.name`)}
									kind="bot"
									face={face}
									color={color === "bot" ? null : color}
									size={48}
								/>
								<span className="lp-bot-text">
									<span className="lp-bot-name">
										{t(`landingPage.bots.${key}.name`)}
										<span className="lp-bot-note">{t(`landingPage.bots.${key}.note`)}</span>
									</span>
									<span className="lp-bot-preview">{t(`landingPage.bots.${key}.preview`)}</span>
								</span>
								<time className="lp-bot-time">{t(`landingPage.bots.${key}.time`)}</time>
							</li>
						))}
					</ul>
					<p className="lp-bots-create">
						<Plus size={16} aria-hidden="true" />
						{t("landingPage.bots.create")}
					</p>
				</figure>
			</div>
		</section>
	);
}

/** The two-sided card: tap to flip between the public face and the private one. */
export function CardSection() {
	const { t } = useTranslation();
	const [flipped, setFlipped] = useState(false);
	const link = typeof window === "undefined" ? "/download" : `${window.location.origin}/download`;
	return (
		<section id="card" className="lp-section lp-section-warm" aria-labelledby="lp-card-title">
			<div className="lp-container lp-split">
				<div className="lp-split-copy" data-reveal>
					<h2 id="lp-card-title">{t("landingPage.card.title")}</h2>
					<p>{t("landingPage.card.lead")}</p>
					<button
						type="button"
						className="lp-action lp-action-secondary lp-action-small"
						aria-pressed={flipped}
						onClick={() => setFlipped((value) => !value)}
					>
						<RotateCw size={16} aria-hidden="true" />
						{t("landingPage.card.flip")}
					</button>
				</div>
				<div className="lp-card-stage" data-reveal>
					<div className="lp-card" data-flipped={flipped || undefined}>
						<section
							className="lp-card-face lp-card-front"
							aria-label={t("landingPage.card.frontLabel")}
							aria-hidden={flipped}
						>
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
								<BrandedQrCode value={link} label={t("landingPage.card.qr")} size={104} />
								<p>
									<ScanQrCode size={16} aria-hidden="true" />
									{t("landingPage.card.scan")}
								</p>
							</div>
						</section>
						<section
							className="lp-card-face lp-card-back"
							aria-label={t("landingPage.card.backLabel")}
							aria-hidden={!flipped}
						>
							<h3>{t("landingPage.card.backLabel")}</h3>
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
		</section>
	);
}

const EVENT_STEPS = ["step1", "step2", "step3"] as const;

/** A pop-up group for one event: the event Bot records, each guest's Bot follows up. */
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
									<span className="lp-line-who">{t("landingPage.events.eventBot")}</span>
									<p>{t("landingPage.events.msg1")}</p>
									<span className="lp-live">
										<AudioLines size={14} aria-hidden="true" />
									</span>
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
					<ol className="lp-event-steps">
						{EVENT_STEPS.map((step, index) => (
							<li key={step} data-reveal style={{ "--i": index } as CSSProperties}>
								<span className="lp-event-index" aria-hidden="true">
									{`0${index + 1}`}
								</span>
								<h3>{t(`landingPage.events.${step}.title`)}</h3>
								<p>{t(`landingPage.events.${step}.body`)}</p>
							</li>
						))}
					</ol>
				</div>
			</div>
		</section>
	);
}
