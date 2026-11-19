import { memberFailureText } from "@yonder/feature-members";
import { Avatar, Button, ListGroup, ListOption, ListRow } from "@yonder/ui-components";
import {
	ownedBots,
	useBot,
	useContacts,
	usePerson,
	useReception,
	useSetReception,
	useSocialKnowledge,
} from "@yonder/ui-data";
import { useId } from "react";
import { useTranslation } from "react-i18next";

function useReceptionBots() {
	const person = usePerson();
	const primary = useBot();
	const contacts = useContacts();
	const bots = ownedBots(contacts.data?.items, person?.id);
	if (primary && !bots.some((bot) => bot.id === primary.id)) bots.unshift(primary);
	return { bots, contacts };
}

/** 「对外接待」: who receives visitors, then what every Bot may tell them (docs/settings-forms.md). */
export function ReceptionOverview({ onOpenPage }: { onOpenPage: (page: "bot" | "info" | "drafts") => void }) {
	const { t } = useTranslation();
	const { bots } = useReceptionBots();
	const setting = useReception();
	const knowledge = useSocialKnowledge();
	const bot = bots.find((item) => item.id === setting.data?.botId);
	const count = knowledge.data?.drafts.length;

	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<ListGroup title={t("members.social.receptionTitle")} footer={t("members.social.receptionScope")}>
				<ListRow
					title={t("members.social.receptionTitle")}
					trailing={bot?.displayName}
					chevron
					onClick={() => onOpenPage("bot")}
				/>
			</ListGroup>
			<ListGroup title={t("members.social.infoTitle")} footer={t("members.social.infoScope")}>
				<ListRow title={t("members.social.infoTitle")} chevron onClick={() => onOpenPage("info")} />
				<ListRow
					title={t("members.social.draftsTitle")}
					trailing={count ? new Intl.NumberFormat().format(count) : undefined}
					chevron
					onClick={() => onOpenPage("drafts")}
				/>
			</ListGroup>
		</div>
	);
}

/** One of the account's Bots receives visitors; a tap saves at once and the check mark moves. */
export function ReceptionSetting() {
	const { t } = useTranslation();
	const group = useId();
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
			<fieldset disabled={update.isPending} className="min-w-0">
				<legend className="sr-only">{t("members.social.chooseBot")}</legend>
				<ListGroup>
					{bots.map((bot) => (
						<ListOption
							key={bot.id}
							name={group}
							value={bot.id}
							checked={current === bot.id}
							onSelect={() => update.mutate(bot.isDefault ? null : bot.id)}
							leading={
								<Avatar name={bot.displayName} src={bot.avatarUrl} kind="bot" size={40} color={bot.avatarColor} />
							}
							title={bot.displayName}
							subtitle={`@${bot.handle}`}
							trailing={bot.isDefault ? t("bots.defaultLabel") : undefined}
						/>
					))}
				</ListGroup>
			</fieldset>
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
