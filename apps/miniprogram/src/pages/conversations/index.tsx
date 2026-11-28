import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { conversationBotOwner, ownedBotFor, visitAvatarOverlay, visitBot } from "@yonder/chat-model";
import type { Conversation } from "@yonder/protocol";
import { useCallback, useEffect, useState } from "react";
import { MiniBotName } from "../../components/bot-name";
import { RemoteAvatar } from "../../components/remote-avatar";
import { Button, go, Page, State } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import "./style.scss";
import { patchConversations, removeConversation, removeMemberFromConversations } from "../../lib/member-cache";
import { api, client, subscribeEvents, useCachedBots, useRealtimeRevision, useSession } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";
import { chatPartner, isObserver } from "../chat/model";
import { conversationPreview } from "./preview";

export default function Conversations({ visitsOnly = false }: { visitsOnly?: boolean }) {
	const { status, me } = useSession();
	const cachedBots = useCachedBots();
	const { locale } = useLocale();
	const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
	const revision = useRealtimeRevision();
	const [items, setItems] = useState<Conversation[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const load = useCallback(async () => {
		if (status !== "signed-in") return;
		setError("");
		try {
			setItems((await api.conversations()).items);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [status]);
	useDidShow(() => {
		if (status === "signed-out") void Taro.reLaunch({ url: "/pages/sign-in/index" });
		else void load();
	});
	usePullDownRefresh(async () => {
		await load();
		await Taro.stopPullDownRefresh();
	});
	useEffect(() => {
		void revision;
		void load();
	}, [revision, load]);
	useEffect(() => {
		void load();
		return subscribeEvents((event) => {
			if (event.type === "conversation.state_changed") void load();
			if (event.type === "conversation.updated")
				setItems((current) => {
					const previous = current.find((item) => item.id === event.conversation.id);
					if (previous && previous.version > event.conversation.version) return current;
					return [event.conversation, ...current.filter((item) => item.id !== event.conversation.id)];
				});
			// A deleted Bot's private chat leaves the list; the row and its messages go with it.
			if (event.type === "conversation.removed")
				setItems((current) => removeConversation(current, event.conversationId));
			// A rename or a new avatar is embedded in the row, so the row is patched, not refetched.
			if (event.type === "member.updated") setItems((current) => patchConversations(current, event.member));
			if (event.type === "member.removed")
				setItems((current) => removeMemberFromConversations(current, event.memberId));
		});
	}, [load]);
	const title = (item: Conversation) =>
		(item.kind === "system" ? t("系统通知", "System notifications") : item.title) ||
		(item.kind === "direct" ? chatPartner(item, me?.member.id)?.displayName : undefined) ||
		item.members
			.filter((member) => member.memberId !== me?.member.id && !isObserver(member))
			.map((member) => member.displayName)
			.join("、") ||
		t("会话", "Conversation");
	const visible = items
		.filter((item) => !item.hiddenFromMessages && title(item).toLowerCase().includes(search.toLowerCase()))
		.sort(
			(a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
		);
	const rows = visible.filter((item) => (item.visit?.role === "host") === visitsOnly);
	const visits = visitsOnly ? [] : visible.filter((item) => item.visit?.role === "host");
	const folderTitle = t("Bot 来访", "Bot visits");
	const avatarSource = (url: string | null | undefined) => (url?.startsWith("/") ? `${client.baseUrl}${url}` : url);
	const row = (item?: Conversation) => {
		const inbound = item?.visit?.role === "host";
		const other = item && chatPartner(item, me?.member.id);
		const overlay = item && visitAvatarOverlay(item, me?.member.id);
		const name = item ? title(item) : folderTitle;
		const visitedBot = item && inbound ? (visitBot(item)?.displayName ?? "Bot") : "";
		const unreadCount = item?.unreadCount ?? Number(visits.some((visit) => visit.unreadCount > 0));
		const url = item ? `/pages/chat/index?id=${encodeURIComponent(item.id)}` : "/pages/bot-visits/index";
		return (
			<View
				key={item?.id ?? url}
				className={item?.pinned ? "card row mini-conversation-pinned" : "card row"}
				ariaRole={item ? undefined : "button"}
				onClick={() => void Taro.navigateTo({ url })}
			>
				<View className="mini-conversation-avatar">
					{item?.visit && other ? (
						<ChatAvatar name={name} kind={other.kind} src={avatarSource(other.avatarUrl)} size={40} />
					) : other?.avatarUrl ? (
						<RemoteAvatar src={other.avatarUrl} />
					) : (
						<View className="mini-avatar">{name.slice(0, 1)}</View>
					)}
					{overlay ? (
						<View className="mini-conversation-avatar-overlay">
							<ChatAvatar
								name={overlay.displayName}
								kind={overlay.kind}
								src={avatarSource(overlay.avatarUrl)}
								size={16}
							/>
						</View>
					) : null}
				</View>
				<View className="mini-conversation-copy">
					<View className="mini-conversation-line">
						{other?.kind === "bot" && item?.kind === "direct" ? (
							<MiniBotName
								name={name}
								ownedBot={ownedBotFor(other.memberId, me?.member.id, me?.bot, cachedBots)}
								owner={conversationBotOwner(other, item)}
								compact="list"
							/>
						) : (
							<Text className="mini-conversation-title">{name}</Text>
						)}
						{item?.lastMessage?.createdAt ? (
							<Text className="mini-conversation-time">{timeFormat.format(new Date(item.lastMessage.createdAt))}</Text>
						) : null}
					</View>
					<View className="mini-conversation-line">
						<Text className="muted mini-preview">
							{!item
								? t("免打扰", "Muted")
								: inbound
									? t(`找你的 ${visitedBot}`, `Visited your ${visitedBot}`)
									: conversationPreview(item, locale, {
											group: t("群聊", "Group"),
											direct: t("开始对话", "Start a conversation"),
										})}
						</Text>
						{unreadCount > 0 ? (
							!item || inbound ? (
								<View className="mini-visit-unread" ariaLabel={t("未读来访", "Unread visit")} />
							) : (
								<Text className="mini-badge">{unreadCount}</Text>
							)
						) : null}
						{item?.muted && !inbound ? <Text className="mini-muted">{t("免打扰", "Muted")}</Text> : null}
					</View>
				</View>
			</View>
		);
	};
	return (
		<Page back={visitsOnly} title={visitsOnly ? folderTitle : t("消息", "Messages")}>
			<View className="stack">
				{!visitsOnly ? (
					<View className="actions">
						<Button secondary onClick={() => void Taro.navigateTo({ url: "/pages/contacts/index" })}>
							{t("联系人 / 新建", "Contacts / New")}
						</Button>
						<Button secondary onClick={() => go("memory")}>
							{t("记忆", "Memory")}
						</Button>
						<Button secondary onClick={() => void Taro.navigateTo({ url: "/pages/me/index" })}>
							{t("我", "Me")}
						</Button>
					</View>
				) : null}
				<Input
					className="mini-input"
					value={search}
					onInput={(e) => setSearch(e.detail.value)}
					placeholder={t("搜索会话", "Search conversations")}
				/>
				<State
					loading={loading}
					error={error}
					empty={!loading && !rows.length && !visits.length ? t("暂无会话", "No conversations") : undefined}
					retry={() => void load()}
				/>
				{rows.map(row)}
				{visits.length ? row() : null}
			</View>
		</Page>
	);
}
