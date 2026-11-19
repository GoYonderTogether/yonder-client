import { Text, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import type { Member } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { ConversationMute } from "../../components/conversation-mute";
import { action, Button, Field, go, Page, State } from "../../components/ui";
import { loadOwnedBot } from "../../lib/bots";
import { t } from "../../lib/i18n";
import { api, client, subscribeEvents, useSession } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";
import { chooseAvatar, uploadBotAvatar } from "./image";
import {
	BOT_COLORS,
	botChanges,
	botFailure,
	canDelete,
	colorOf,
	deleteMessage,
	hasChanges,
	nameProblem,
} from "./rules";
import "./style.scss";

const avatarSrc = (url: string | null | undefined) =>
	url ? (url.startsWith("/") ? `${client.baseUrl}${url}` : url) : undefined;

/** The Bot's plans: the ones made in its private chat go with it when it is deleted. */
async function planCount(botId: string): Promise<number | null> {
	try {
		const [conversations, schedules] = await Promise.all([api.conversations(), api.schedules()]);
		const chat = conversations.items.find(
			(item) => item.kind === "direct" && item.members.some((member) => member.memberId === botId),
		);
		if (!chat) return null;
		return schedules.items.filter((schedule) => schedule.conversationId === chat.id).length;
	} catch {
		return null;
	}
}

export default function Bot() {
	const { id: routeId, view, conversationId } = useRouter().params;
	const id = decodeURIComponent(routeId ?? "");
	const editing = view === "edit";
	const editTitle = t("编辑 Bot 资料", "Edit Bot profile");
	const { me, status } = useSession();
	const [bot, setBot] = useState<Member | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState("");
	const [error, setError] = useState("");
	const [name, setName] = useState("");
	const [color, setColor] = useState<string>(BOT_COLORS[0]);
	const [saving, setSaving] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const loaded = useRef(false);
	const meId = me?.member.id ?? "";
	const load = async () => {
		if (!meId || !id) return;
		setLoadError("");
		try {
			const found = await loadOwnedBot(meId, id);
			setBot(found ?? null);
			if (found && !loaded.current) {
				setName(found.displayName);
				setColor(colorOf(found));
				loaded.current = true;
			}
		} catch (cause) {
			setLoadError(botFailure(cause));
		} finally {
			setLoading(false);
		}
	};
	const loadRef = useRef(load);
	loadRef.current = load;
	useEffect(() => {
		if (status !== "signed-in" || !meId || !id) return;
		void loadRef.current();
		// Another device renaming or deleting this Bot is visible here without a refetch; a removal
		// leaves the page saying the Bot is gone rather than keeping a row that no longer exists.
		return subscribeEvents((event) => {
			if (event.type === "member.updated" && event.member.id === id) setBot(event.member);
			if (event.type === "member.removed" && event.memberId === id) setBot(null);
		});
	}, [status, meId, id]);
	useDidShow(() => {
		if (status === "signed-in" && loaded.current) void loadRef.current();
	});

	const changes = bot ? botChanges(bot, name, color) : {};
	const problem = nameProblem(name);
	const save = () =>
		void action(async () => {
			if (!bot || problem || !hasChanges(changes)) return;
			setSaving(true);
			setError("");
			try {
				const updated = await api.updateBot(bot.id, changes);
				setBot(updated);
				setName(updated.displayName);
				setColor(colorOf(updated));
				void Taro.showToast({ title: t("已保存", "Saved"), icon: "success" });
			} catch (cause) {
				setError(botFailure(cause));
			} finally {
				setSaving(false);
			}
		});

	const pickImage = () =>
		void action(async () => {
			if (!bot) return;
			const file = await chooseAvatar();
			if (!file) return;
			setUploading(true);
			setError("");
			try {
				const updated = await uploadBotAvatar(bot.id, file);
				setBot(updated);
			} catch (cause) {
				setError(botFailure(cause));
			} finally {
				setUploading(false);
			}
		});

	const clearImage = () =>
		void action(async () => {
			if (!bot) return;
			setUploading(true);
			setError("");
			try {
				setBot(await api.updateBot(bot.id, { clearAvatar: true }));
			} catch (cause) {
				setError(botFailure(cause));
			} finally {
				setUploading(false);
			}
		});

	const remove = () =>
		void action(async () => {
			if (!bot) return;
			const confirmed = await Taro.showModal({
				title: t("删除这个 Bot？", "Delete this bot?"),
				content: deleteMessage(await planCount(bot.id)),
				confirmText: t("删除", "Delete"),
				cancelText: t("取消", "Cancel"),
			});
			if (!confirmed.confirm) return;
			setDeleting(true);
			setError("");
			try {
				await api.deleteBot(bot.id);
				await Taro.reLaunch({ url: "/pages/conversations/index" });
			} catch (cause) {
				setError(botFailure(cause));
				setDeleting(false);
			}
		});

	return (
		<Page title={editing ? editTitle : bot?.displayName || t("Bot", "Bot")}>
			<State loading={loading} error={loadError} retry={() => void load()} />
			{!loading && !loadError && !bot ? (
				<View className="mini-card">
					<State empty={t("没有找到这个 Bot", "That bot was not found")} />
				</View>
			) : null}
			{bot && editing ? (
				<View className="mini-card">
					<View className="mini-bot-preview">
						<ChatAvatar name={bot.displayName} kind="bot" src={avatarSrc(bot.avatarUrl)} color={color} size={72} />
					</View>
					<View className="mini-bot-colors">
						{BOT_COLORS.map((value) => (
							<View
								key={value}
								className={`mini-bot-color ${value === color ? "mini-bot-color-active" : ""}`}
								style={{ backgroundColor: `var(--color-avatar-${value}-bg)` }}
								onClick={() => setColor(value)}
								ariaRole="button"
								ariaSelected={value === color}
								ariaLabel={t(`颜色 ${value}`, `Colour ${value}`)}
							/>
						))}
					</View>
					<Button secondary loading={uploading} onClick={pickImage}>
						{t("上传头像", "Upload avatar")}
					</Button>
					{bot.avatarUrl ? (
						<Button secondary loading={uploading} onClick={clearImage}>
							{t("清除头像", "Remove avatar")}
						</Button>
					) : null}
					<Field label={t("名字", "Name")} value={name} onInput={setName} />
					{problem ? <Text className="mini-error">{problem}</Text> : null}
					{error ? <Text className="mini-error">{error}</Text> : null}
					<Button loading={saving} disabled={Boolean(problem) || !hasChanges(changes)} onClick={save}>
						{t("保存", "Save")}
					</Button>
				</View>
			) : null}
			{bot && !editing ? (
				<>
					<View className="mini-card mini-row">
						<ChatAvatar
							name={bot.displayName}
							kind="bot"
							src={avatarSrc(bot.avatarUrl)}
							color={bot.avatarColor}
							size={48}
						/>
						<View className="mini-row-main">
							<Text>{bot.displayName}</Text>
							<Text className="mini-muted">ID @{bot.handle}</Text>
						</View>
						<View className="mini-bot-edit-action">
							<Button secondary onClick={() => go(`/pages/bot/index?id=${encodeURIComponent(bot.id)}&view=edit`)}>
								{t("编辑", "Edit")}
							</Button>
						</View>
					</View>
					{conversationId ? <ConversationMute conversationId={conversationId} /> : null}
					{error ? <Text className="mini-error">{error}</Text> : null}
					{canDelete(bot) ? (
						<Button danger loading={deleting} onClick={remove}>
							{t("删除这个 Bot", "Delete this bot")}
						</Button>
					) : null}
				</>
			) : null}
		</Page>
	);
}
