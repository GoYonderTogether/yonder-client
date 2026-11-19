import { conversationPeer } from "@yonder/chat-model";
import { GroupInfo } from "@yonder/feature-members";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import type { SidePage, SidePanelControls, SideStack } from "@yonder/ui-shell";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { MemberCardView } from "../pages/member-card.tsx";
import {
	CHAT_BOT_PAGE_TITLE,
	type ChatBotPage,
	ChatBotSettings,
	ChatBotSettingsChild,
	chatBotPageStack,
} from "./chat-bot-settings.tsx";
import { ConversationNotificationSettings } from "./conversation-notification-settings.tsx";

/**
 * One page of the right-hand side panel. The frame's own entries are rebuilt from live data on
 * every render; `page` is a page another screen handed over, whose content fetches its own data.
 */
export type SideEntry =
	| { kind: "bot"; id: string }
	| { kind: "member"; handle: string }
	| { kind: "group" }
	| { kind: "page"; page: SidePage };

/**
 * The frame's right-hand side panel (17 3.1, 3.2, 3.5): group info, a Bot this account owns, and
 * anyone else's card. Opening from the chat replaces what the panel shows; opening from inside the
 * panel (a member from group info) stacks one page on it, and back returns to group info.
 */
export function useFrameLayers() {
	const [localStack, setStack] = useState<readonly SideEntry[]>([]);
	const { pathname, search, hash, state } = useLocation();
	const navigate = useNavigate();
	const botDrawer = (state as { chatBotDrawer?: { id: string; page?: ChatBotPage } } | null)?.chatBotDrawer;
	const currentBotDrawer = useRef(botDrawer);
	const previousBotDrawer = useRef(botDrawer);
	const botOpeners = useRef(new Map<ChatBotPage | "overview", HTMLElement>());
	currentBotDrawer.current = botDrawer;
	useLayoutEffect(() => {
		const previous = previousBotDrawer.current;
		previousBotDrawer.current = botDrawer;
		if (!previous || (botDrawer && previous.id !== botDrawer.id)) return;
		if (botDrawer && chatBotPageStack(previous.page).length <= chatBotPageStack(botDrawer.page).length) return;
		const target = botOpeners.current.get(botDrawer ? (previous.page ?? "overview") : "overview");
		// The router may make the opener inert before the new drawer captures its focus.
		const frame = requestAnimationFrame(() => {
			if (target?.isConnected && !target.closest("[inert]")) target.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [botDrawer]);
	// Same-URL router entries keep browser Back in this chat and restore each visible Bot page.
	const openBot = useCallback(
		(id: string, page?: ChatBotPage) => {
			if (!page) botOpeners.current.clear();
			if (document.activeElement instanceof HTMLElement)
				botOpeners.current.set(page ?? "overview", document.activeElement);
			navigate(`${pathname}${search}${hash}`, { state: { ...state, chatBotDrawer: { id, page } } });
		},
		[pathname, search, hash, state, navigate],
	);
	const open = useCallback(
		(entry: SideEntry) => {
			if (entry.kind === "bot") openBot(entry.id);
			else setStack([entry]);
		},
		[openBot],
	);
	const push = useCallback((entry: SideEntry) => setStack((current) => [...current, entry]), []);
	const back = useCallback(
		(key?: string) => {
			if (currentBotDrawer.current) {
				if (!key || key === currentBotDrawer.current.page) navigate(-1);
				return;
			}
			setStack((current) => {
				const top = current.at(-1);
				if (!top || (key !== undefined && (top.kind !== "page" || top.page.key !== key))) return current;
				return current.slice(0, -1);
			});
		},
		[navigate],
	);
	const clear = useCallback(() => setStack([]), []);
	const close = useCallback(() => {
		const drawer = currentBotDrawer.current;
		if (drawer) navigate(-1 - chatBotPageStack(drawer.page).length);
		else clear();
	}, [navigate, clear]);
	return useMemo(
		() => ({
			stack: botDrawer ? [{ kind: "bot", id: botDrawer.id } satisfies SideEntry] : localStack,
			botDrawer,
			open,
			push,
			back,
			close,
			clear,
			openBot,
			openGroup: () => open({ kind: "group" }),
			/** What pages get through `useSidePanel`. */
			controls: {
				open: (page: SidePage) => open({ kind: "page", page }),
				push: (page: SidePage) => push({ kind: "page", page }),
				back,
				close,
			} satisfies SidePanelControls,
		}),
		[localStack, botDrawer, open, push, back, close, clear, openBot],
	);
}

export type FrameLayers = ReturnType<typeof useFrameLayers>;

/** Builds the shell's side stack from the frame's entries; entries that cannot be shown are skipped. */
export function useSideStack({
	layers,
	conversation,
	personId,
	defaultBot,
	contacts,
	onBotDirtyChange,
	onBotDeleted,
	onOpenMember,
	onLeftGroup,
}: {
	layers: FrameLayers;
	conversation: Conversation | undefined;
	personId: string | undefined;
	defaultBot: Member | undefined;
	contacts: readonly Member[] | undefined;
	onBotDirtyChange: (dirty: boolean) => void;
	onBotDeleted: (chatId: string | undefined) => void;
	/** A member opened from inside the panel; the caller decides between a Bot's detail and a card. */
	onOpenMember: (member: ConversationMember) => void;
	onLeftGroup: () => void;
}): SideStack {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const peer = conversation?.kind === "direct" ? conversationPeer(conversation, personId) : undefined;
	const preferences =
		conversation && !conversation.closedReason ? (
			<ConversationNotificationSettings
				key={conversation.id}
				id={conversation.id}
				muted={conversation.muted === true}
			/>
		) : undefined;
	const pages = layers.stack.flatMap((entry, index): SidePage[] => {
		const key = `${index}:${entryKey(entry)}`;
		switch (entry.kind) {
			case "bot": {
				const bot = defaultBot?.id === entry.id ? defaultBot : contacts?.find((item) => item.id === entry.id);
				if (!bot || !personId || bot.kind !== "bot" || (bot !== defaultBot && bot.ownerId !== personId)) return [];
				const openBotPage = (page: ChatBotPage) => layers.openBot(bot.id, page);
				return [
					{
						key,
						title: bot.displayName,
						content: (
							<ChatBotSettings
								key={bot.id}
								bot={bot}
								preferences={peer?.memberId === bot.id ? preferences : undefined}
								{...(layers.botDrawer ? { onOpenPage: openBotPage } : {})}
								onDeleted={(chatId) => {
									if (chatId && chatId === conversation?.id) layers.clear();
									else layers.close();
									onBotDeleted(chatId);
								}}
							/>
						),
					},
					...chatBotPageStack(layers.botDrawer?.page).map((page) => ({
						key: `${key}:${page}`,
						title: t(CHAT_BOT_PAGE_TITLE[page]),
						content: (
							<ChatBotSettingsChild
								bot={bot}
								page={page}
								back={() => layers.back(page)}
								onDirtyChange={onBotDirtyChange}
								onOpenExternal={() => openBotPage("external")}
							/>
						),
					})),
				];
			}
			case "member":
				return [
					{
						key,
						title: t("members.card.title"),
						content: (
							<>
								<MemberCardView
									handle={entry.handle}
									onOpenConversation={(conversationId) => {
										layers.close();
										navigate(`/messages/${encodeURIComponent(conversationId)}`);
									}}
									onOpenOwner={(owner) => layers.push({ kind: "member", handle: owner })}
									onOpenBot={(bot) => layers.push({ kind: "member", handle: bot })}
									onOpenPrivacy={() => {
										layers.close();
										navigate("/me/privacy");
									}}
									onHome={layers.close}
								/>
								{peer?.handle === entry.handle && preferences ? (
									<div className="p-[var(--spacing-4)]">{preferences}</div>
								) : null}
							</>
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
								preferences={preferences}
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
			case "page":
				return [{ ...entry.page, key }];
			default:
				return [];
		}
	});
	return {
		pages,
		onBack: () => layers.back(),
		onClose: layers.close,
		backLabel: t("app.back"),
		closeLabel: t("app.close"),
	};
}

function entryKey(entry: SideEntry): string {
	switch (entry.kind) {
		case "bot":
			return `bot:${entry.id}`;
		case "member":
			return `member:${entry.handle}`;
		case "group":
			return "group";
		case "page":
			return `page:${entry.page.key}`;
	}
}
