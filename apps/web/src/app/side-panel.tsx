import { FeishuChannel } from "@yonder/feature-me";
import { BotDetail, GroupInfo } from "@yonder/feature-members";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import type { SidePage, SideStack } from "@yonder/ui-shell";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MemberCardView } from "../pages/member-card.tsx";

/** One page of the right-hand side panel. */
export type SideEntry = { kind: "bot"; id: string } | { kind: "member"; handle: string } | { kind: "group" };

/**
 * The frame's right-hand side panel (17 3.1, 3.2, 3.5): group info, a Bot this account owns, and
 * anyone else's card. Opening from the chat replaces what the panel shows; opening from inside the
 * panel (a member from group info) stacks one page on it, and back returns to group info.
 */
export function useFrameLayers() {
	const [stack, setStack] = useState<readonly SideEntry[]>([]);
	const open = useCallback((entry: SideEntry) => setStack([entry]), []);
	const push = useCallback((entry: SideEntry) => setStack((current) => [...current, entry]), []);
	const back = useCallback(() => setStack((current) => current.slice(0, -1)), []);
	const close = useCallback(() => setStack([]), []);
	return useMemo(
		() => ({
			stack,
			open,
			push,
			back,
			close,
			openBot: (id: string | null) => (id ? open({ kind: "bot", id }) : close()),
			openGroup: () => open({ kind: "group" }),
		}),
		[stack, open, push, back, close],
	);
}

export type FrameLayers = ReturnType<typeof useFrameLayers>;

/** Builds the shell's side stack from the frame's entries; entries that cannot be shown are skipped. */
export function useSideStack({
	layers,
	conversation,
	personId,
	contacts,
	onBotDeleted,
	onOpenMember,
	onLeftGroup,
}: {
	layers: FrameLayers;
	conversation: Conversation | undefined;
	personId: string | undefined;
	contacts: readonly Member[] | undefined;
	onBotDeleted: (chatId: string | undefined) => void;
	/** A member opened from inside the panel; the caller decides between a Bot's detail and a card. */
	onOpenMember: (member: ConversationMember) => void;
	onLeftGroup: () => void;
}): SideStack {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const pages = layers.stack.flatMap((entry, index): SidePage[] => {
		const key = `${index}:${entryKey(entry)}`;
		switch (entry.kind) {
			case "bot": {
				const bot = contacts?.find((item) => item.id === entry.id);
				if (!bot || !personId || bot.kind !== "bot" || bot.ownerId !== personId) return [];
				return [
					{
						key,
						title: bot.displayName,
						content: (
							<div className="flex flex-col">
								<BotDetail
									bot={bot}
									onDeleted={(chatId) => {
										layers.close();
										onBotDeleted(chatId);
									}}
								/>
								<div className="px-[var(--spacing-6)] pb-[var(--spacing-6)]">
									<FeishuChannel key={bot.id} botId={bot.id} />
								</div>
							</div>
						),
					},
				];
			}
			case "member":
				return [
					{
						key,
						title: t("members.card.title"),
						content: (
							<MemberCardView
								handle={entry.handle}
								onOpenConversation={(conversationId) => {
									layers.close();
									navigate(`/messages/${encodeURIComponent(conversationId)}`);
								}}
								onOpenOwner={(owner) => layers.push({ kind: "member", handle: owner })}
								onOpenPrivacy={() => {
									layers.close();
									navigate("/me/privacy");
								}}
								onHome={layers.close}
							/>
						),
					},
				];
			case "group":
				if (conversation?.kind !== "group") return [];
				return [
					{
						key,
						title: t("members.group.title"),
						content: (
							<GroupInfo
								conversation={conversation}
								personId={personId}
								onOpenMember={onOpenMember}
								onLeft={() => {
									layers.close();
									onLeftGroup();
								}}
							/>
						),
					},
				];
			default:
				return [];
		}
	});
	return {
		pages,
		onBack: layers.back,
		onClose: layers.close,
		backLabel: t("app.back"),
		closeLabel: t("app.close"),
	};
}

function entryKey(entry: SideEntry): string {
	return entry.kind === "bot" ? `bot:${entry.id}` : entry.kind === "member" ? `member:${entry.handle}` : "group";
}
