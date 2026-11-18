import { ownedBots, useContacts, usePerson, useReception, useSetReception } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

export function ReceptionSetting() {
	const { t } = useTranslation();
	const person = usePerson();
	const contacts = useContacts();
	const setting = useReception();
	const update = useSetReception();
	const bots = ownedBots(contacts.data?.items, person?.id);
	if (setting.isLoading || contacts.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (!setting.data || !contacts.data)
		return (
			<div>
				<p role="alert">{t("members.errors.unknown")}</p>
				<button
					type="button"
					onClick={() => {
						void setting.refetch();
						void contacts.refetch();
					}}
				>
					{t("app.retry")}
				</button>
			</div>
		);
	return (
		<label className="flex flex-col gap-[var(--spacing-2)] py-[var(--spacing-4)]">
			<span>{t("members.actions.reception")}</span>
			<select
				aria-label={t("members.actions.reception")}
				value={setting.data.botId}
				disabled={update.isPending}
				className="rounded-[var(--radius-control-sm)] bg-[var(--color-bg-surface)] p-[var(--spacing-2)] text-[var(--color-text-primary)]"
				onChange={(event) =>
					update.mutate(bots.find((bot) => bot.id === event.target.value)?.isDefault ? null : event.target.value)
				}
			>
				{bots.map((bot) => (
					<option key={bot.id} value={bot.id}>
						{bot.displayName}
					</option>
				))}
			</select>
			{update.isError ? <span role="alert">{t("members.errors.unknown")}</span> : null}
		</label>
	);
}
