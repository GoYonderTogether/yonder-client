import { Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { useState } from "react";
import { action, Button, go, Page, Row, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t, useLocale } from "../../lib/i18n";
import { api, client, useSession } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";
import {
	addableContacts,
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
				<Button secondary onClick={onManage}>
					{t("管理", "Manage")}
				</Button>
			) : null}
		</View>
	);
}

export default function Group() {
	const id = useRouter().params.id ?? "";
	const { me } = useSession();
	const { locale } = useLocale();
	const { data, loading, error, reload } = useResource(async () => {
		const found = (await api.conversations()).items.find((item) => item.id === id);
		if (!found)
			throw new Error(t("这个群聊不存在，或你已经不在群里", "This group does not exist, or you are no longer in it"));
		return found;
	});
	const owner = data ? isOwner(data, me?.member.id) : false;
	const closed = data ? isClosed(data) : false;
	const [title, setTitle] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [contacts, setContacts] = useState<Member[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [showAdd, setShowAdd] = useState(false);

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

	return (
		<Page title={t("群聊信息", "Group info")}>
			<State loading={loading} error={error} retry={() => void reload()} />
			{data ? (
				<View className="mini-card">
					{owner && !closed ? (
						<View>
							<Input
								className="mini-input"
								value={title ?? data.title ?? ""}
								onInput={(event) => setTitle(event.detail.value)}
								placeholder={t("群聊名称", "Group name")}
							/>
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
						</View>
					) : (
						<Text className="mini-subtitle">{data.title || t("群聊", "Group")}</Text>
					)}
					{owner && !closed && data.groupBotPayer !== undefined ? (
						<Button
							disabled={busy}
							onClick={() =>
								void action(async () => {
									const { tapIndex } = await Taro.showActionSheet({
										itemList: [t("@ Bot 的人", "Person who mentions the Bot"), t("群主", "Group owner")],
									});
									const groupBotPayer = tapIndex === 1 ? "owner" : "mentioner";
									if (groupBotPayer === data.groupBotPayer) return;
									setBusy(true);
									try {
										await api.updateGroup(data.id, { groupBotPayer });
										await reload();
									} finally {
										setBusy(false);
									}
								})
							}
						>
							{data.groupBotPayer === "owner"
								? t("Bot 回复由群主付费", "Group owner pays for Bot replies")
								: t("Bot 回复由 @ Bot 的人付费", "Person who mentions the Bot pays for replies")}
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
			{data && owner && !closed ? (
				<View className="mini-card">
					<Button
						secondary
						onClick={() =>
							void action(async () => {
								setContacts((await api.contacts()).items);
								setShowAdd(true);
							})
						}
					>
						{t("添加成员", "Add members")}
					</Button>
					{showAdd ? (
						<>
							{contacts.length && !addableContacts(contacts, data.members).length ? (
								<State empty={t("没有可添加的联系人", "No contacts left to add")} />
							) : null}
							{addableContacts(contacts, data.members).map((contact) => (
								<Row
									key={contact.id}
									title={contact.displayName}
									detail={selected.includes(contact.id) ? t("已选择", "Selected") : `@${contact.handle}`}
									onClick={() =>
										setSelected((current) =>
											current.includes(contact.id)
												? current.filter((value) => value !== contact.id)
												: [...current, contact.id],
										)
									}
								/>
							))}
							<Button
								loading={busy}
								disabled={!selected.length}
								onClick={() =>
									void action(async () => {
										setBusy(true);
										try {
											await api.addGroupMembers(data.id, { memberIds: selected });
											setSelected([]);
											setShowAdd(false);
											await reload();
										} finally {
											setBusy(false);
										}
									})
								}
							>
								{t("加入群聊", "Add to group")}
							</Button>
						</>
					) : null}
				</View>
			) : null}
			{data && !closed && owner ? (
				<Button danger onClick={() => void action(() => dissolve(data))}>
					{t("解散群聊", "Dissolve group")}
				</Button>
			) : null}
			{data && !closed && !owner && canLeave(data, me?.member.id) ? (
				<Button danger onClick={() => void action(() => leave(data))}>
					{t("退出群聊", "Leave group")}
				</Button>
			) : null}
		</Page>
	);
}
