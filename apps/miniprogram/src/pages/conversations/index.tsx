import { Image, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import type { Conversation } from "@yonder/protocol";
import { useCallback, useEffect, useState } from "react";
import { Button, go, Page, State } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import "./style.scss";
import { patchConversations, removeConversation, removeMemberFromConversations } from "../../lib/member-cache";
import { api, client, subscribeEvents, useRealtimeRevision, useSession } from "../../lib/runtime";
import { directPartner, isObserver } from "../chat/model";
import { conversationPreview } from "./preview";

export default function Conversations() {
	const { status, me } = useSession();
	const { locale } = useLocale();
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
		item.title ||
		item.members
			.filter((member) => member.memberId !== me?.member.id && !isObserver(member))
			.map((member) => member.displayName)
			.join("、") ||
		t("会话", "Conversation");
	const visible = items
		.filter((item) => title(item).toLowerCase().includes(search.toLowerCase()))
		.sort(
			(a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
		);
	return (
		<Page back={false} title={t("消息", "Messages")}>
			<View className="stack">
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
				<Input
					className="mini-input"
					value={search}
					onInput={(e) => setSearch(e.detail.value)}
					placeholder={t("搜索会话", "Search conversations")}
				/>
				<State
					loading={loading}
					error={error}
					empty={!loading && !visible.length ? t("暂无会话", "No conversations") : undefined}
					retry={() => void load()}
				/>
				{visible.map((item) => {
					const other = directPartner(item.members, me?.member.id);
					return (
						<View
							key={item.id}
							className="card row"
							onClick={() => void Taro.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(item.id)}` })}
						>
							{other?.avatarUrl ? (
								<Image
									className="mini-avatar"
									src={other.avatarUrl.startsWith("/") ? `${client.baseUrl}${other.avatarUrl}` : other.avatarUrl}
								/>
							) : (
								<View className="mini-avatar">{title(item).slice(0, 1)}</View>
							)}
							<View className="mini-conversation-copy">
								<View className="row">
									<Text className="mini-conversation-title">{title(item)}</Text>
									{item.unreadCount > 0 && <Text className="mini-badge">{item.unreadCount}</Text>}
								</View>
								<Text className="muted mini-preview">
									{conversationPreview(item, locale, {
										group: t("群聊", "Group"),
										direct: t("开始对话", "Start a conversation"),
									})}
								</Text>
							</View>
						</View>
					);
				})}
			</View>
		</Page>
	);
}
