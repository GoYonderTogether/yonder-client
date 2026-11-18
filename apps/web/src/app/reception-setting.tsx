import { memberFailureText } from "@yonder/feature-members";
import { Avatar, Button, IconTile, ListGroup, ListRow } from "@yonder/ui-components";
import {
	ownedBots,
	useBot,
	useContacts,
	usePerson,
	useReception,
	useSetReception,
	useSocialKnowledge,
} from "@yonder/ui-data";
import { Bot, ClipboardCheck, FileText } from "lucide-react";
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

export function ReceptionOverview({ onOpenPage }: { onOpenPage: (page: "bot" | "info" | "drafts") => void }) {
	const { t } = useTranslation();
	const { bots } = useReceptionBots();
	const setting = useReception();
	const knowledge = useSocialKnowledge();
	const bot = bots.find((item) => item.id === setting.data?.botId);
	const count = knowledge.data?.drafts.length;

	return (
		<ListGroup>
			<ListRow
				leading={
					<IconTile>
						<Bot size={18} />
					</IconTile>
				}
				title={t("members.social.receptionTitle")}
				subtitle={bot?.displayName}
				chevron
				onClick={() => onOpenPage("bot")}
			/>
			<ListRow
				leading={
					<IconTile>
						<FileText size={18} />
					</IconTile>
				}
				title={t("members.social.infoTitle")}
				subtitle={t("members.social.sharedByAll")}
				chevron
				onClick={() => onOpenPage("info")}
			/>
			<ListRow
				leading={
					<IconTile>
						<ClipboardCheck size={18} />
					</IconTile>
				}
				title={t("members.social.draftsTitle")}
				trailing={count ? new Intl.NumberFormat().format(count) : undefined}
				chevron
				onClick={() => onOpenPage("drafts")}
			/>
		</ListGroup>
	);
}

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
						<li key={bot.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
							<label className="flex min-h-[var(--row-height)] cursor-pointer items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)] hover:bg-[var(--color-bg-hover)]">
								<Avatar name={bot.displayName} src={bot.avatarUrl} kind="bot" size={40} color={bot.avatarColor} />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-body">{bot.displayName}</span>
									<span className="truncate text-caption text-[var(--color-text-secondary)]">@{bot.handle}</span>
								</span>
								{bot.isDefault ? (
									<span className="text-caption text-[var(--color-text-secondary)]">{t("bots.defaultLabel")}</span>
								) : null}
								<input
									type="radio"
									name={group}
									value={bot.id}
									aria-label={bot.displayName}
									checked={current === bot.id}
									onChange={() => update.mutate(bot.isDefault ? null : bot.id)}
									className="shrink-0 accent-[var(--color-accent)]"
								/>
							</label>
						</li>
					))}
				</ListGroup>
			</fieldset>
			{update.isError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{memberFailureText(update.error, t)}
				</p>
			) : (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{update.isPending ? t("app.saving") : update.isSuccess ? t("members.social.saved") : null}
				</p>
			)}
		</div>
	);
}
