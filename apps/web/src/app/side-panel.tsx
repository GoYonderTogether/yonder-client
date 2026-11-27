import { conversationPeer } from "@yonder/chat-model";
import { GroupInfo } from "@yonder/feature-members";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import {
	DiscardChangesDialog,
	type LayoutMode,
	ShellProvider,
	type SidePage,
	SidePanelProvider,
	type SideStack,
	useOptionalSidePanel,
} from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { Bot, UserRound, Users } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { conversationTitle } from "../pages/conversation-presentation.tsx";
import { MemberCardView } from "../pages/member-card.tsx";
import { CHAT_BOT_PAGE_TITLE, type ChatBotPage, ChatBotSettings, ChatBotSettingsChild } from "./chat-bot-settings.tsx";
import { ConversationNotificationSettings } from "./conversation-notification-settings.tsx";
import type { DetailTabs, SideEntry } from "./use-detail-tabs.ts";

export function memberDetail(
	member: ConversationMember | Member,
	personId: string | undefined,
	defaultBot: Member | undefined,
	contacts: readonly Member[] | undefined,
	conversationId?: string,
): SideEntry | null {
	const id = "memberId" in member ? member.memberId : member.id;
	const contact = contacts?.find((item) => item.id === id);
	if (id === defaultBot?.id || (contact?.kind === "bot" && contact.ownerId === personId))
		return { kind: "bot", id, conversationId };
	const handle = member.handle ?? contact?.handle;
	return handle ? { kind: "member", handle, title: member.displayName, conversationId } : null;
}

/** Resolves live profiles and conversations for each tab, including ones opened in an earlier chat. */
export function useSideStack({
	layers,
	settings,
	conversations,
	personId,
	defaultBot,
	contacts,
	onBotDeleted,
	onLeftGroup,
}: {
	layers: DetailTabs;
	settings: boolean;
	conversations: readonly Conversation[] | undefined;
	personId: string | undefined;
	defaultBot: Member | undefined;
	contacts: readonly Member[] | undefined;
	onBotDeleted: (chatId: string | undefined) => void;
	onLeftGroup: (conversationId: string) => void;
}): SideStack {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const tabs = layers.tabs.flatMap((tab) => {
		const pages = tab.entries.flatMap(({ key, value }): SidePage[] => {
			const resolved = render(tab.key, key, value);
			return resolved
				? [
						{
							...resolved,
							content: (
								<ScopedPage layers={layers} tab={tab.key} page={key}>
									{resolved.content}
								</ScopedPage>
							),
						},
					]
				: [];
		});
		return pages[0] ? [{ key: tab.key, pages }] : [];
	});
	const active = tabs.find((tab) => tab.key === layers.active);
	const settingsTab = layers.tabs.find((tab) => tab.key === layers.active)?.settings;
	return {
		tabs,
		active: active?.key ?? null,
		expanded: Boolean(active && layers.expanded && (!settings || settingsTab)),
		onActivate: layers.activate,
		onMove: layers.move,
		onBack: () => layers.back(),
		onClose: layers.close,
		onCloseAll: layers.closeAll,
		onCollapse: layers.collapse,
		labels: {
			pane: t("nav.detailPane"),
			back: t("app.back"),
			close: t("app.close"),
			closeTab: (title) => t("nav.closeDetailTab", { title }),
			closeAll: t("nav.closeAllDetails"),
			closeAllCount: (count) => t("nav.closeAllDetailsCount", { count }),
			collapse: t("nav.collapseDetails"),
			expand: t("nav.expandDetails"),
			resize: t("nav.resizeDetails"),
		},
	};

	function render(tab: string, key: string, entry: SideEntry): SidePage | null {
		const conversation =
			"conversationId" in entry ? conversations?.find((item) => item.id === entry.conversationId) : undefined;
		const peer = conversation?.kind === "direct" ? conversationPeer(conversation, personId) : undefined;
		const preferences =
			conversation && !conversation.closedReason ? (
				<ConversationNotificationSettings id={conversation.id} muted={conversation.muted === true} />
			) : undefined;
		switch (entry.kind) {
			case "bot":
			case "bot-page": {
				const bot = defaultBot?.id === entry.id ? defaultBot : contacts?.find((item) => item.id === entry.id);
				if (!bot || !personId || bot.kind !== "bot" || (bot !== defaultBot && bot.ownerId !== personId)) return null;
				const openBotPage = (page: ChatBotPage) => layers.push({ kind: "bot-page", id: bot.id, page }, tab);
				return entry.kind === "bot"
					? {
							key,
							title: bot.displayName,
							icon: <Bot size={ICON_SIZE.sm} aria-hidden="true" />,
							content: (
								<ChatBotSettings
									bot={bot}
									conversationId={
										peer?.memberId === bot.id && !conversation?.visit && !conversation?.closedReason
											? conversation?.id
											: undefined
									}
									preferences={peer?.memberId === bot.id ? preferences : undefined}
									onOpenPage={openBotPage}
									onDeleted={(chatId) => {
										layers.remove([tab]);
										onBotDeleted(chatId);
									}}
								/>
							),
						}
					: {
							key,
							title: t(CHAT_BOT_PAGE_TITLE[entry.page]),
							icon: <Bot size={ICON_SIZE.sm} aria-hidden="true" />,
							content: (
								<ChatBotDetailPage
									bot={bot}
									page={entry.page}
									layers={layers}
									tab={tab}
									pageKey={key}
									onOpenPage={openBotPage}
								/>
							),
						};
			}
			case "member":
				return {
					key,
					title: entry.title ?? t("members.card.title"),
					icon: <UserRound size={ICON_SIZE.sm} aria-hidden="true" />,
					content: (
						<>
							<MemberCardView
								handle={entry.handle}
								onOpenConversation={(id) => navigate(`/messages/${encodeURIComponent(id)}`)}
								onOpenOwner={(handle) => layers.open({ kind: "member", handle })}
								onOpenBot={(handle) => layers.open({ kind: "member", handle })}
								onOpenPrivacy={() => navigate("/me/privacy")}
								onHome={() => layers.close(tab)}
							/>
							{peer?.handle === entry.handle && preferences ? (
								<div className="p-[var(--spacing-4)]">{preferences}</div>
							) : null}
						</>
					),
				};
			case "group":
				if (conversation?.kind !== "group") return null;
				return {
					key,
					title: conversationTitle(conversation, personId) || t("members.group.title"),
					icon: <Users size={ICON_SIZE.sm} aria-hidden="true" />,
					content: (
						<GroupInfo
							conversation={conversation}
							preferences={preferences}
							personId={personId}
							onOpenMember={(member) => {
								const detail = memberDetail(member, personId, defaultBot, contacts);
								if (detail) layers.open(detail);
							}}
							onLeft={() => {
								layers.remove([tab]);
								onLeftGroup(conversation.id);
							}}
						/>
					),
				};
			case "page":
				return entry.page;
		}
	}
}

export function DetailDiscardDialog({
	layers,
	mode,
	desktop,
}: {
	layers: DetailTabs;
	mode: LayoutMode;
	desktop: boolean;
}) {
	const { t } = useTranslation();
	return (
		<ShellProvider value={{ mode, desktop, left: null, meOpen: false }}>
			<DiscardChangesDialog
				open={Boolean(layers.confirm)}
				body={t("bots.discardChanges")}
				onCancel={layers.clearConfirmation}
				onConfirm={() => {
					layers.confirm?.();
					layers.clearConfirmation();
				}}
			/>
		</ShellProvider>
	);
}

function ScopedPage({
	layers: { controlsFor },
	tab,
	page,
	children,
}: {
	layers: DetailTabs;
	tab: string;
	page: string;
	children: ReactNode;
}) {
	const primaryResource = useOptionalSidePanel()?.primaryResource ?? null;
	const controls = useMemo(
		() => ({ ...controlsFor(tab, page), primaryResource }),
		[controlsFor, tab, page, primaryResource],
	);
	return <SidePanelProvider value={controls}>{children}</SidePanelProvider>;
}

function ChatBotDetailPage({
	bot,
	page,
	layers: { controlsFor },
	tab,
	pageKey,
	onOpenPage,
}: {
	bot: Member;
	page: ChatBotPage;
	layers: DetailTabs;
	tab: string;
	pageKey: string;
	onOpenPage: (page: ChatBotPage) => void;
}) {
	const controls = useMemo(() => controlsFor(tab, pageKey), [controlsFor, tab, pageKey]);
	return (
		<ChatBotSettingsChild
			bot={bot}
			page={page}
			back={() => controls.back(pageKey)}
			onDirtyChange={controls.setDirty}
			onOpenPage={onOpenPage}
		/>
	);
}
