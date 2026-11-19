import type { Conversation, Member, Schedule } from "@yonder/protocol";
import { Avatar, ListGroup, ListRow } from "@yonder/ui-components";
import { useConversations, useDeleteBot, useSchedules } from "@yonder/ui-data";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../group/confirm-dialog.tsx";
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

/**
 * A Bot's settings home, the same in 「我 › 我的 Bot」 and in its chat's drawer: who it is, the
 * pages that change it, then whatever the caller adds (the chat's mute switch), then delete on its
 * own at the end (docs/settings-forms.md).
 */
export function BotSettingsOverview({
	bot,
	onEdit,
	onPersona,
	onChannels,
	onDeleted,
	children,
}: {
	bot: Member;
	onEdit: () => void;
	onPersona: () => void;
	onChannels: () => void;
	onDeleted: (conversationId: string | undefined) => void;
	/** Sections the caller adds between the settings and delete. */
	children?: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<div className="flex min-w-0 items-center gap-[var(--spacing-4)] px-[var(--spacing-1)] py-[var(--spacing-2)]">
				<Avatar name={bot.displayName} src={bot.avatarUrl} color={botColor(bot)} kind="bot" size={64} />
				<div className="flex min-w-0 flex-col gap-[var(--spacing-1)]">
					<div className="flex min-w-0 items-center gap-[var(--spacing-2)]">
						<p className="truncate text-h2 font-semibold text-[var(--color-text-primary)]">{bot.displayName}</p>
						{bot.isDefault ? (
							<span className="shrink-0 rounded-[var(--radius-full)] bg-[var(--color-bg-subtle)] px-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
								{t("bots.defaultLabel")}
							</span>
						) : null}
					</div>
					<p className="truncate text-caption text-[var(--color-text-tertiary)]">@{bot.handle}</p>
				</div>
			</div>
			<ListGroup title={t("bots.settings")}>
				<ListRow title={t("bots.basicProfile")} chevron onClick={onEdit} />
				<ListRow title={t("members.social.personaTitle")} chevron onClick={onPersona} />
				<ListRow title={t("bots.channels")} chevron onClick={onChannels} />
			</ListGroup>
			{children}
			<BotRemoval bot={bot} onDeleted={onDeleted} />
		</div>
	);
}

function BotRemoval({ bot, onDeleted }: { bot: Member; onDeleted: (chatId: string | undefined) => void }) {
	const { t } = useTranslation();
	const [confirming, setConfirming] = useState(false);
	if (bot.isDefault) return null;
	return (
		<>
			<ListGroup>
				<ListRow title={t("bots.deleteBot")} tone="danger" onClick={() => setConfirming(true)} />
			</ListGroup>
			{confirming ? <BotDelete bot={bot} onCancel={() => setConfirming(false)} onDeleted={onDeleted} /> : null}
		</>
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
		<ConfirmDialog
			open
			title={t("bots.deleteTitle")}
			body={t("bots.deleteBody", { plans, history: t("bots.deleteHistory") })}
			confirmLabel={t("bots.confirmDelete")}
			busy={remove.isPending}
			error={error}
			onCancel={onCancel}
			onConfirm={() => {
				setError(null);
				remove.mutate(bot.id, {
					onSuccess: () => onDeleted(chat?.id),
					onError: (failure) => setError(describeBotError(failure, t, "bots.deleteFailed")),
				});
			}}
		/>
	);
}
