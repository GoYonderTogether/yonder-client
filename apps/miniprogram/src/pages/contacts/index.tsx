import { Image, Switch, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { botRoleProblem } from "@yonder/chat-model";
import type { Member } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { FriendRequestCard } from "../../components/friend-request-card";
import { qrTarget } from "../../components/qr-target";
import { action, Button, Field, go, Page, State } from "../../components/ui";
import { useFriendRequests } from "../../components/use-friend-requests";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api, client } from "../../lib/runtime";

export default function Contacts() {
	const requests = useFriendRequests();
	const { data, loading, error, reload } = useResource(() => api.contacts());
	const accepted = requests.items
		.filter((item) => item.status === "accepted")
		.map((item) => item.id)
		.join(",");
	useEffect(() => {
		if (accepted) void reload();
	}, [accepted, reload]);
	const [sent, setSent] = useState<string[]>([]);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Member[]>([]);
	const [name, setName] = useState("");
	const [role, setRole] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const open = (id: string) => go(`/pages/chat/index?id=${encodeURIComponent(id)}`);
	return (
		<Page title={t("联系人", "Contacts")}>
			<State loading={requests.loading} error={requests.error} retry={() => void requests.reload()} />
			{requests.items.length ? (
				<View>
					<Text>{t("好友申请", "Friend requests")}</Text>
					{requests.items.map((request) => (
						<FriendRequestCard key={request.id} id={request.id} />
					))}
				</View>
			) : null}
			<View className="mini-card">
				<Field label={t("搜索 ID 或昵称", "Search ID or name")} value={query} onInput={setQuery} />
				<Button
					disabled={!query.trim()}
					onClick={() => void action(async () => setResults((await api.searchContacts(query.trim())).items))}
				>
					{t("搜索", "Search")}
				</Button>
				{results.map((member) => (
					<View key={member.id} className="mini-row">
						<View>
							<Text>{member.displayName}</Text>
							<Text className="mini-muted">{member.handle}</Text>
						</View>
						<Button
							secondary
							disabled={sent.includes(member.id)}
							onClick={() =>
								void action(async () => {
									await requests.request(member.id);
									setSent((old) => [...old, member.id]);
								})
							}
						>
							{sent.includes(member.id) ? t("已发送申请", "Request sent") : t("发送好友申请", "Send friend request")}
						</Button>
					</View>
				))}
			</View>
			<View className="mini-card">
				<State
					loading={loading}
					error={error}
					retry={() => void reload()}
					empty={!data?.items.length ? t("还没有联系人", "No contacts yet") : undefined}
				/>
				{data?.items.map((member) => (
					<View className="mini-row" key={member.id}>
						{member.avatarUrl && (
							<Image
								src={member.avatarUrl.startsWith("/") ? `${client.baseUrl}${member.avatarUrl}` : member.avatarUrl}
								className="mini-avatar"
							/>
						)}
						<View
							className="mini-row-main"
							onClick={() => void action(async () => open((await api.addContact(member.id)).conversation.id))}
						>
							<Text>{member.displayName}</Text>
							<Text className="mini-muted">{member.handle}</Text>
						</View>
						<Switch
							checked={selected.includes(member.id)}
							onChange={(event) =>
								setSelected((current) =>
									event.detail.value ? [...current, member.id] : current.filter((id) => id !== member.id),
								)
							}
						/>
					</View>
				))}
			</View>
			<View className="mini-card">
				<Field label={t("名称", "Name")} value={name} onInput={setName} />
				<Field
					label={t("职责备注（仅自己可见）", "Responsibility note (only visible to you)")}
					value={role}
					onInput={setRole}
					maxlength={24}
				/>
				<Button
					disabled={!name.trim() || Boolean(botRoleProblem(role))}
					onClick={() =>
						void action(async () =>
							open(
								(
									await api.createBot({
										displayName: name.trim(),
										...(role.trim() ? { botRoleLabel: role.trim() } : {}),
									})
								).conversation.id,
							),
						)
					}
				>
					{t("创建 BOT", "Create bot")}
				</Button>
				<Button
					secondary
					disabled={!selected.length}
					onClick={() =>
						void action(async () =>
							open((await api.createGroup({ memberIds: selected, ...(name.trim() ? { title: name.trim() } : {}) })).id),
						)
					}
				>
					{t("用所选联系人创建群聊", "Create group with selected contacts")}
				</Button>
				<Button
					secondary
					onClick={() =>
						void action(async () => {
							const code = await Taro.scanCode({ scanType: ["qrCode"] });
							const handle = qrTarget(code.result, client.baseUrl);
							if (!handle) throw new Error(t("不是有效的 Yonder 二维码", "Not a valid Yonder QR code"));
							if (handle.startsWith("/i/")) {
								go(`/pages/sign-in/index?invite=${encodeURIComponent(handle.slice(3))}`);
								return;
							}
							setQuery(handle);
							setResults((await api.searchContacts(handle)).items);
						})
					}
				>
					{t("扫码添加", "Scan contact QR")}
				</Button>
			</View>
		</Page>
	);
}
