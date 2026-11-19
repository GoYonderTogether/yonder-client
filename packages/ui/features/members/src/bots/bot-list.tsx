import { Avatar, Button, ListGroup, ListRow } from "@yonder/ui-components";
import { ownedBots, useContacts, usePerson } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { botColor } from "./bot-avatar-picker.tsx";

export interface BotListProps {
	/** Tapping a row opens that Bot's detail. */
	onOpen: (botId: string) => void;
}

/**
 * 「我 › Bot」: one row per Bot this account owns, the default Bot first (15 第二节第 3 条,
 * 17 3.5). Only owned Bots — another person's Bot is not managed here.
 */
export function BotList({ onOpen }: BotListProps) {
	const { t } = useTranslation();
	const person = usePerson();
	const contacts = useContacts();
	const bots = ownedBots(contacts.data?.items, person?.id);

	if (contacts.isError && !contacts.data)
		return (
			<div className="flex items-center gap-[var(--spacing-3)]">
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("bots.loadFailed")}
				</p>
				<Button variant="link" size="sm" onClick={() => void contacts.refetch()}>
					{t("app.retry")}
				</Button>
			</div>
		);

	if (contacts.isLoading)
		return (
			<p role="status" className="text-caption text-[var(--color-text-secondary)]">
				{t("app.loading")}
			</p>
		);

	if (bots.length === 0) return <p className="text-caption text-[var(--color-text-secondary)]">{t("bots.empty")}</p>;

	return (
		<ListGroup>
			{bots.map((bot) => (
				<ListRow
					key={bot.id}
					leading={<Avatar name={bot.displayName} src={bot.avatarUrl} size={40} kind="bot" color={botColor(bot)} />}
					title={bot.displayName}
					subtitle={`@${bot.handle}`}
					trailing={bot.isDefault ? t("bots.defaultLabel") : undefined}
					chevron
					onClick={() => onOpen(bot.id)}
				/>
			))}
		</ListGroup>
	);
}
