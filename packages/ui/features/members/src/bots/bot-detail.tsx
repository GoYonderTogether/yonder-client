import type { Conversation, Member, Schedule } from "@yonder/protocol";
import { Button, ListGroup } from "@yonder/ui-components";
import { useConversations, useDeleteBot, useSchedules } from "@yonder/ui-data";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { describeBotError } from "./bot-error.ts";
import { BotForm } from "./bot-form.tsx";

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

export interface BotDetailProps {
	bot: Member;
	/** The frame goes back to the message list once the Bot is gone, given the chat that went too. */
	onDeleted?: (conversationId: string | undefined) => void;
}

/** 「Bot 详情」for a Bot this account owns (17 3.5): the form in edit mode, and its end. */
export function BotDetail({ bot, onDeleted }: BotDetailProps) {
	const { t } = useTranslation();
	const [confirming, setConfirming] = useState(false);
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<BotForm mode="edit" bot={bot} />
			<ListGroup>
				<li className="flex min-h-[var(--row-height)] items-center justify-between gap-[var(--spacing-3)] px-[var(--spacing-4)]">
					<span className="text-body text-[var(--color-text-secondary)]">{t("bots.handle")}</span>
					<span className="truncate text-body text-[var(--color-text-primary)]">@{bot.handle}</span>
				</li>
			</ListGroup>
			{/* The default Bot has no delete button, and no sentence explaining why (15 第二节第 1 条). */}
			{bot.isDefault ? null : confirming ? (
				<BotDelete bot={bot} onCancel={() => setConfirming(false)} {...(onDeleted ? { onDeleted } : {})} />
			) : (
				<Button variant="danger" block onClick={() => setConfirming(true)}>
					<Trash2 size={16} aria-hidden="true" />
					{t("bots.deleteBot")}
				</Button>
			)}
		</div>
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
	onDeleted?: (conversationId: string | undefined) => void;
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
							onSuccess: () => onDeleted?.(chat?.id),
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
