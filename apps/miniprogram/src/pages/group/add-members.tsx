import { Checkbox, CheckboxGroup, Input, Label, ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { addableContacts, filterContacts, GROUP_MEMBER_LIMIT, recentContacts } from "@yonder/chat-model";
import type { Conversation, Member } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { action, Button, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api, client } from "../../lib/runtime";
import { ChatAvatar } from "../chat/avatar";

export function AddMembers({
	group,
	conversations,
	personId,
}: {
	group: Conversation;
	conversations: Conversation[];
	personId: string | undefined;
}) {
	const { data, loading, error, reload } = useResource(async () => (await api.contacts()).items);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const contacts = addableContacts(data ?? [], group.members);
	const eligible = new Map(contacts.map((contact) => [contact.id, contact]));
	const selectedIds = selected.filter((id) => eligible.has(id));
	const room = Math.max(0, GROUP_MEMBER_LIMIT - group.members.length);
	const needle = query.trim();
	const visible = filterContacts(contacts, needle);
	const recent = needle ? [] : recentContacts(conversations, eligible, personId);

	const submit = async () => {
		if (busy || !selectedIds.length || selectedIds.length > room) return;
		const depth = Taro.getCurrentPages().length;
		setBusy(true);
		try {
			await api.addGroupMembers(group.id, { memberIds: selectedIds });
			if (!mounted.current || Taro.getCurrentPages().length !== depth) return;
			if (depth > 1) await Taro.navigateBack();
			else await Taro.redirectTo({ url: `/pages/group/index?id=${encodeURIComponent(group.id)}` });
		} finally {
			if (mounted.current) setBusy(false);
		}
	};

	const list = (items: Member[], title?: string) => {
		if (!items.length) return null;
		return (
			<View className="mini-card">
				{title ? <Text className="mini-muted">{title}</Text> : null}
				<CheckboxGroup
					onChange={(event) => {
						const checked = event.detail.value;
						const section = new Set(items.map((contact) => contact.id));
						setSelected((current) => [...current.filter((id) => !section.has(id)), ...checked]);
					}}
				>
					{items.map((contact) => {
						const checked = selectedIds.includes(contact.id);
						return (
							<Label key={contact.id}>
								<View className="mini-row">
									<Checkbox
										value={contact.id}
										checked={checked}
										disabled={busy || (selectedIds.length >= room && !checked)}
									/>
									<View ariaHidden>
										<ChatAvatar
											name={contact.displayName}
											kind={contact.kind}
											src={
												contact.avatarUrl?.startsWith("/") ? `${client.baseUrl}${contact.avatarUrl}` : contact.avatarUrl
											}
											color={contact.avatarColor}
										/>
									</View>
									<Text className="mini-row-main">{contact.displayName}</Text>
								</View>
							</Label>
						);
					})}
				</CheckboxGroup>
			</View>
		);
	};

	const searchLabel = t("搜索联系人", "Search contacts");
	return (
		<View className="mini-group-picker">
			<Input
				className="mini-input"
				ariaLabel={searchLabel}
				placeholder={searchLabel}
				value={query}
				onInput={(event) => setQuery(event.detail.value)}
			/>
			<ScrollView className="mini-group-picker-scroll" scrollY>
				{loading || error ? <State loading={loading} error={error} retry={() => void reload()} /> : null}
				{!loading && !error && !visible.length ? (
					<State
						empty={
							contacts.length
								? t("没有找到联系人", "No contacts found")
								: t("没有可添加的联系人", "No contacts left to add")
						}
					/>
				) : null}
				{list(recent, t("最近联系人", "Recent contacts"))}
				{list(visible, needle ? undefined : t("全部联系人", "All contacts"))}
			</ScrollView>
			<View className="actions">
				{selectedIds.length ? (
					<Text className="mini-muted">{t(`已选 · ${selectedIds.length}`, `Selected · ${selectedIds.length}`)}</Text>
				) : null}
				<Button
					loading={busy}
					disabled={!selectedIds.length || selectedIds.length > room}
					onClick={() => void action(submit)}
				>
					{t("添加", "Add")}
				</Button>
			</View>
		</View>
	);
}
