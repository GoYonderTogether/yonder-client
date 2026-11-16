import { Avatar, type BotFaceId, ConversationList, ConversationRow } from "@yonder/ui-components";
import { Plus } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

const BOTS: { key: string; face: BotFaceId; color: string | null }[] = [
	{ key: "main", face: 1, color: null },
	{ key: "travel", face: 3, color: "1" },
	{ key: "money", face: 4, color: "3" },
	{ key: "thesis", face: 5, color: "4" },
	{ key: "home", face: 6, color: "2" },
];

/**
 * The Bot list in the app's own conversation rows, beside the conversation of the Bot you pick.
 * Picking a row swaps the conversation; the new one replays its two lines.
 */
export function BotsSection() {
	const { t } = useTranslation();
	const [current, setCurrent] = useState(0);
	const bot = BOTS[current] ?? BOTS[0];
	if (!bot) return null;
	const name = t(`landingPage.bots.${bot.key}.name`);

	return (
		<section id="bots" className="lp-section" aria-labelledby="lp-bots-title">
			<div className="lp-container">
				<header className="lp-head" data-reveal>
					<h2 id="lp-bots-title">{t("landingPage.bots.title")}</h2>
					<p>{t("landingPage.bots.lead")}</p>
				</header>
				<div className="lp-bots-demo" data-reveal>
					<div className="lp-bots">
						<ConversationList label={t("landingPage.bots.list")}>
							{BOTS.map(({ key, face, color }, index) => (
								<ConversationRow
									key={key}
									className="lp-bot"
									style={{ "--i": index } as CSSProperties}
									selected={index === current}
									onClick={() => setCurrent(index)}
									leading={
										<Avatar name={t(`landingPage.bots.${key}.name`)} kind="bot" face={face} color={color} size={48} />
									}
									title={
										<>
											{t(`landingPage.bots.${key}.name`)}
											<span className="lp-bot-note">{t(`landingPage.bots.${key}.note`)}</span>
										</>
									}
									preview={t(`landingPage.bots.${key}.preview`)}
									meta={t(`landingPage.bots.${key}.time`)}
								/>
							))}
						</ConversationList>
						<p className="lp-bots-create">
							<span className="lp-bots-plus" aria-hidden="true">
								<Plus size={16} />
							</span>
							{t("landingPage.bots.create")}
						</p>
					</div>

					<figure className="lp-bots-chat" aria-live="polite" aria-label={name}>
						<div className="lp-bots-chat-head">
							<Avatar name={name} kind="bot" face={bot.face} color={bot.color} size={36} />
							<span>
								<span className="lp-bots-chat-name">{name}</span>
								<span className="lp-bots-chat-note">{t(`landingPage.bots.${bot.key}.note`)}</span>
							</span>
						</div>
						<div className="lp-bots-chat-body" key={bot.key}>
							<p className="lp-bubble lp-bubble-out">{t(`landingPage.bots.${bot.key}.you`)}</p>
							<p className="lp-bubble lp-bubble-in">{t(`landingPage.bots.${bot.key}.reply`)}</p>
						</div>
						<p className="lp-bots-hint">{t("landingPage.bots.hint")}</p>
					</figure>
				</div>
			</div>
		</section>
	);
}
