import { Input, Label, Radio, RadioGroup, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type { Conversation, ConversationMember } from "@yonder/protocol";
import { useState } from "react";
import { ConversationMute } from "../../components/conversation-mute";
import { action, Button, go, Page, Row, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t, useLocale } from "../../lib/i18n";
import { api, client, useSession } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";
import { AddMembers } from "./add-members";
import {
	canAddMembers,
	canLeave,
	canRemove,
	canTransfer,
	dissolveCopy,
	isClosed,
	isOwner,
	leaveCopy,
	orderedMembers,
	removeCopy,
	transferCopy,
} from "./model";
import "./style.scss";

const avatarSrc = (url: string | null | undefined) =>
	url ? (url.startsWith("/") ? `${client.baseUrl}${url}` : url) : undefined;

async function confirm(copy: { title: string; content: string; confirm: string }): Promise<boolean> {
	const result = await Taro.showModal({
		title: copy.title,
		content: copy.content,
		confirmText: copy.confirm,
		cancelText: t("取消", "Cancel"),
	});
	return result.confirm;
}

function MemberRow({
	member,
	onOpen,
	onManage,
	self,
}: {
	member: ConversationMember;
	onOpen: () => void;
	onManage?: () => void;
	self: boolean;
}) {
	const role = member.role === "owner" ? t("群主", "Owner") : member.kind === "bot" ? t("Bot", "Bot") : "";
	return (
		<View className="mini-row">
			<ChatAvatar
				name={member.displayName}
				kind={member.kind}
				src={avatarSrc(member.avatarUrl)}
				color={member.avatarColor}
				size={40}
			/>
			<View className="mini-row-main" onClick={onOpen}>
				<Text>{self ? t(`${member.displayName}（我）`, `${member.displayName} (me)`) : member.displayName}</Text>
				{role ? <Text className="mini-muted">{role}</Text> : null}
			</View>
			{onManage ? (
				<View className="mini-group-manage">
					<Button secondary onClick={onManage}>
						{t("管理", "Manage")}
					</Button>
				</View>
			) : null}
		</View>
	);
}

export default function Group() {
	const { id = "", view } = useRouter().params;
	const { me } = useSession();
	const { locale } = useLocale();
	const {
		data: resource,
		loading,
		error,
		reload,
	} = useResource(async () => {
		const { items } = await api.conversations();
		const group = items.find((item) => item.id === id && item.kind === "group");
		if (!group)
			throw new Error(t("这个群聊不存在，或你已经不在群里", "This group does not exist, or you are no longer in it"));
		// Contacts tell a member whether any of their own Bots is left to bring in; a failed read only
		// hides that one row, never the group.
		const contacts = await api.contacts().then(
			(result) => result.items,
			() => [],
		);
		return { group, conversations: items, contacts };
	});
	const data = resource?.group;
	const owner = data ? isOwner(data, me?.member.id) : false;
	const closed = data ? isClosed(data) : false;
	const canAdd = data ? canAddMembers(data, me?.member.id, resource?.contacts ?? []) : false;
	const [title, setTitle] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const openSettings = (page: "add" | "bot") => go(`/pages/group/index?id=${encodeURIComponent(id)}&view=${page}`);

	const backFrom = () => {
		if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
		else void Taro.reLaunch({ url: "/pages/conversations/index" });
	};
	const leave = async (conversation: Conversation) => {
		if (!me || !(await confirm(leaveCopy(locale)))) return;
		await api.removeGroupMember(conversation.id, me.member.id);
		void Taro.reLaunch({ url: "/pages/conversations/index" });
	};
	/** The chat stays the reader's place to be: it now keeps the history and the closed line. */
	const dissolve = async (conversation: Conversation) => {
		if (!(await confirm(dissolveCopy(locale)))) return;
		await api.dissolveGroup(conversation.id);
		backFrom();
	};
	const manage = async (conversation: Conversation, member: ConversationMember) => {
		const options: Array<"remove" | "transfer"> = [];
		if (canRemove(conversation, me?.member.id, member)) options.push("remove");
		if (canTransfer(conversation, me?.member.id, member)) options.push("transfer");
		if (!options.length) return;
		const labels = options.map((option) =>
			option === "remove" ? t("移出群聊", "Remove from group") : t("转让群主", "Transfer ownership"),
		);
		const { tapIndex } = await Taro.showActionSheet({ itemList: labels });
		const chosen = options[tapIndex];
		if (chosen === "remove") {
			if (!(await confirm(removeCopy(member.displayName, locale)))) return;
			await api.removeGroupMember(conversation.id, member.memberId);
			await reload();
			return;
		}
		if (!(await confirm(transferCopy(member.displayName, locale)))) return;
		await api.transferGroupOwner(conversation.id, { memberId: member.memberId });
		await reload();
	};
	const resourceState = loading || error ? <State loading={loading} error={error} retry={() => void reload()} /> : null;

	if (view === "add" || view === "bot") {
		const pageTitle =
			view === "add"
				? owner
					? t("添加成员", "Add members")
					: t("添加我的 Bot", "Add my Bot")
				: t("Bot 设置", "Bot settings");
		const payer = resource?.group.groupBotPayer;
		if (!resource || closed || (view === "add" ? !canAdd : !owner || payer === undefined))
			return (
				<Page title={pageTitle}>
					{resourceState || <State error={t("当前无法管理该群聊", "This group cannot be managed right now")} />}
				</Page>
			);
		if (view === "add")
			return (
				<Page title={pageTitle}>
					<AddMembers group={resource.group} conversations={resource.conversations} personId={me?.member.id} />
				</Page>
			);
		return (
			<Page title={pageTitle}>
				{resourceState}
				<View className="mini-card">
					<Text className="mini-subtitle">{t("Bot 回复由谁付费", "Who pays for Bot replies?")}</Text>
					<RadioGroup
						onChange={({ detail: { value } }) => {
							if (busy || value === payer || (value !== "mentioner" && value !== "owner")) return;
							void action(async () => {
								setBusy(true);
								try {
									await api.updateGroup(resource.group.id, { groupBotPayer: value });
									await reload();
								} finally {
									setBusy(false);
								}
							});
						}}
					>
						<Label>
							<View className="mini-row">
								<Radio value="mentioner" checked={payer === "mentioner"} disabled={busy} />
								<Text className="mini-row-main">{t("@ Bot 的人", "Person who mentions the Bot")}</Text>
							</View>
						</Label>
						<Label>
							<View className="mini-row">
								<Radio value="owner" checked={payer === "owner"} disabled={busy} />
								<Text className="mini-row-main">{t("群主", "Group owner")}</Text>
							</View>
						</Label>
					</RadioGroup>
				</View>
			</Page>
		);
	}

	return (
		<Page title={t("群聊信息", "Group info")}>
			<View className="mini-group-layout">
				{resourceState}
				{data ? (
					<View className="mini-card">
						<View className="mini-group-name">
							{data.members.length ? (
								<View className="mini-group-avatar" ariaHidden>
									{data.members.slice(0, 4).map((member) => (
										<ChatAvatar
											key={member.memberId}
											name={member.displayName}
											kind={member.kind}
											src={avatarSrc(member.avatarUrl)}
											color={member.avatarColor}
											size={16}
										/>
									))}
								</View>
							) : (
								<ChatAvatar name={data.title || t("群聊", "Group")} kind="person" size={40} />
							)}
							{owner && !closed ? (
								<Input
									className="mini-input mini-group-name-field"
									value={title ?? data.title ?? ""}
									onInput={(event) => setTitle(event.detail.value)}
									placeholder={t("群聊名称", "Group name")}
								/>
							) : (
								<Text className="mini-group-name-field">{data.title || t("群聊", "Group")}</Text>
							)}
						</View>
						{owner && !closed ? (
							<Button
								loading={busy}
								disabled={title === null || !title.trim() || title.trim() === (data.title ?? "")}
								onClick={() =>
									void action(async () => {
										setBusy(true);
										try {
											await api.updateGroup(data.id, { title: (title ?? "").trim() });
											setTitle(null);
											await reload();
										} finally {
											setBusy(false);
										}
									})
								}
							>
								{t("保存群名", "Save name")}
							</Button>
						) : null}
						{orderedMembers(data.members).map((member) => (
							<MemberRow
								key={member.memberId}
								member={member}
								self={member.memberId === me?.member.id}
								onOpen={() => go(`/pages/member/index?handle=${encodeURIComponent(member.handle)}`)}
								onManage={
									canRemove(data, me?.member.id, member) || canTransfer(data, me?.member.id, member)
										? () => void action(() => manage(data, member))
										: undefined
								}
							/>
						))}
					</View>
				) : null}
				{data && !closed ? <ConversationMute conversationId={data.id} /> : null}
				{data && canAdd && !closed ? (
					<View className="mini-card">
						<Row
							title={owner ? t("添加成员", "Add members") : t("添加我的 Bot", "Add my Bot")}
							onClick={() => openSettings("add")}
						/>
						{owner && data.groupBotPayer !== undefined ? (
							<Row title={t("Bot 设置", "Bot settings")} onClick={() => openSettings("bot")} />
						) : null}
					</View>
				) : null}
				{data && !closed && (owner || canLeave(data, me?.member.id)) ? (
					<View className="mini-group-danger">
						<Button danger onClick={() => void action(() => (owner ? dissolve(data) : leave(data)))}>
							{owner ? t("解散群聊", "Dissolve group") : t("退出群聊", "Leave group")}
						</Button>
					</View>
				) : null}
			</View>
		</Page>
	);
}
