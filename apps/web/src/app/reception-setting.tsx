import { memberFailureText } from "@yonder/feature-members";
import { BotSelector, Button } from "@yonder/ui-components";
import { ownedBots, useBot, useContacts, usePerson, useReception, useSetReception } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

function useReceptionBots() {
	const person = usePerson();
	const primary = useBot();
	const contacts = useContacts();
	const bots = ownedBots(contacts.data?.items, person?.id);
	if (primary && !bots.some((bot) => bot.id === primary.id)) bots.unshift(primary);
	return { bots, contacts };
}

/** One of the account's Bots receives visitors; selecting it immediately saves the assignment. */
export function ReceptionSetting() {
	const { t } = useTranslation();
	const { bots, contacts } = useReceptionBots();
	const setting = useReception();
	const update = useSetReception();
	if (setting.isLoading || contacts.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (!setting.data || !contacts.data)
		return (
			<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{memberFailureText(setting.error ?? contacts.error, t) || t("app.loadFailed")}
				</p>
				<Button
					variant="link"
					size="sm"
					onClick={() => {
						void setting.refetch();
						void contacts.refetch();
					}}
				>
					{t("app.retry")}
				</Button>
			</div>
		);
	if (!bots.length) return <p className="text-caption text-[var(--color-text-secondary)]">{t("bots.empty")}</p>;
	const current = update.isPending
		? (update.variables ?? bots.find((bot) => bot.isDefault)?.id ?? setting.data.botId)
		: setting.data.botId;

	return (
		<div className="flex flex-col gap-[var(--spacing-3)]">
			<BotSelector
				label={t("members.social.receptionTitle")}
				bots={bots}
				selectedBotId={current}
				onSelectBot={(id) => update.mutate(bots.find((bot) => bot.id === id)?.isDefault ? null : id)}
				disabled={update.isPending}
			/>
			{update.isError ? (
				<p role="alert" className="px-[var(--spacing-1)] text-caption text-[var(--color-danger)]">
					{memberFailureText(update.error, t)}
				</p>
			) : (
				<p role="status" className="px-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)]">
					{update.isPending ? t("app.saving") : update.isSuccess ? t("members.social.saved") : null}
				</p>
			)}
		</div>
	);
}
