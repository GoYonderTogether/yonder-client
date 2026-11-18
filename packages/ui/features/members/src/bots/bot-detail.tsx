import type { Conversation, Member, Schedule } from "@yonder/protocol";
import { Avatar, Button, IconTile, ListGroup, ListRow } from "@yonder/ui-components";
import { useConversations, useDeleteBot, useSchedules } from "@yonder/ui-data";
import { Cable, MessageSquareText, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { botColor } from "./bot-avatar-picker.tsx";
import { describeBotError } from "./bot-error.ts";

/** The Bot's own private chat: a direct conversation whose members are the Bot and me. */
export function botConversation(botId: string, items: readonly Conversation[] | undefined): Conversation | undefined {
	return items?.find(
		(conversation) =>
			conversation.kind === "direct" && conversation.members.some((member) => member.memberId === botId),
	);
}

/**
 * How many plans go with the Bot (15 第三节第 3 条: the confirmation says the number). Plans are
 * counted where this client can see them — the Bot's own private chat — so a plan in a group is
 * not counted; `null` means the list has not loaded yet and the sentence then omits the number.
 */
export function plansInConversation(
	schedules: readonly Schedule[] | undefined,
	conversationId: string | undefined,
): number | null {
	if (!schedules || !conversationId) return null;
	return schedules.filter((plan) => plan.conversationId === conversationId).length;
}

export function BotSettingsOverview({
	bot,
	onEdit,
	onPersona,
	onChannels,
	onDeleted,
}: {
	bot: Member;
	onEdit: () => void;
	onPersona: () => void;
	onChannels: () => void;
	onDeleted: (conversationId: string | undefined) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<div className="flex min-w-0 items-center gap-[var(--spacing-3)]">
				<Avatar name={bot.displayName} src={bot.avatarUrl} color={botColor(bot)} kind="bot" size={48} />
				<p className="min-w-0 truncate text-body text-[var(--color-text-secondary)]">@{bot.handle}</p>
				{bot.isDefault ? (
					<span className="shrink-0 rounded-full bg-[var(--color-bg-subtle)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)]">
						{t("bots.defaultLabel")}
					</span>
				) : null}
			</div>
			<ListGroup title={t("bots.settings")}>
				<ListRow
					leading={
						<IconTile>
							<UserRound size={16} />
						</IconTile>
					}
					title={t("bots.basicProfile")}
					subtitle={t("bots.basicProfileSummary")}
					chevron
					onClick={onEdit}
				/>
				<ListRow
					leading={
						<IconTile>
							<MessageSquareText size={16} />
						</IconTile>
					}
					title={t("members.social.personaTitle")}
					subtitle={t("bots.externalPersonaSummary")}
					chevron
					onClick={onPersona}
				/>
				<ListRow
					leading={
						<IconTile>
							<Cable size={16} />
						</IconTile>
					}
					title={t("bots.channels")}
					subtitle={t("bots.channelsSummary")}
					chevron
					onClick={onChannels}
				/>
			</ListGroup>
			<BotRemoval bot={bot} onDeleted={onDeleted} />
		</div>
	);
}

function BotRemoval({ bot, onDeleted }: { bot: Member; onDeleted: (chatId: string | undefined) => void }) {
	const { t } = useTranslation();
	const [confirming, setConfirming] = useState(false);
	if (bot.isDefault) return null;
	return confirming ? (
		<BotDelete bot={bot} onCancel={() => setConfirming(false)} onDeleted={onDeleted} />
	) : (
		<Button variant="danger" block onClick={() => setConfirming(true)}>
			<Trash2 size={16} aria-hidden="true" />
			{t("bots.deleteBot")}
		</Button>
	);
}

/**
 * The confirmation, mounted only after the user asks to delete: that is also when the plan list is
 * fetched, so opening a Bot's page costs no extra request.
 */
function BotDelete({
	bot,
	onCancel,
	onDeleted,
}: {
	bot: Member;
	onCancel: () => void;
	onDeleted: (conversationId: string | undefined) => void;
}) {
	const { t } = useTranslation();
	const remove = useDeleteBot();
	const conversations = useConversations();
	const schedules = useSchedules();
	const [error, setError] = useState<string | null>(null);
	const chat = botConversation(bot.id, conversations.data?.items);
	const count = plansInConversation(schedules.data?.items, chat?.id);
	const plans =
		count === null
			? t("bots.deletePlansUnknown")
			: count === 0
				? t("bots.deletePlansNone")
				: count === 1
					? t("bots.deletePlansOne")
					: t("bots.deletePlansOther", { count });

	return (
		<div className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-danger-subtle)] p-[var(--spacing-4)]">
			<p className="text-body font-medium text-[var(--color-text-primary)]">{t("bots.deleteTitle")}</p>
			<p className="text-caption text-[var(--color-text-secondary)]">{plans}</p>
			<p className="text-caption text-[var(--color-text-secondary)]">{t("bots.deleteHistory")}</p>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<div className="flex justify-end gap-[var(--spacing-2)]">
				<Button onClick={onCancel} disabled={remove.isPending}>
					{t("app.cancel")}
				</Button>
				<Button
					variant="danger"
					loading={remove.isPending}
					aria-label={t("bots.confirmDelete")}
					onClick={() => {
						setError(null);
						remove.mutate(bot.id, {
							onSuccess: () => onDeleted(chat?.id),
							onError: (failure) => setError(describeBotError(failure, t, "bots.deleteFailed")),
						});
					}}
				>
					{t("bots.confirmDelete")}
				</Button>
			</div>
		</div>
	);
}
