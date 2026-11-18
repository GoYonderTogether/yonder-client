import { addableContacts, filterContacts, GROUP_MEMBER_LIMIT, recentContacts } from "@yonder/chat-model";
import type { Conversation, Member } from "@yonder/protocol";
import { Avatar, Button, Checkbox, cn, SearchInput } from "@yonder/ui-components";
import { useContacts, useConversations } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { memberFailureText } from "../profile/failure.ts";

export interface AddMembersProps {
	/** The group as it is now; people already in it are not offered again. */
	conversation: Conversation;
	adding: boolean;
	error: unknown;
	inPage?: boolean;
	onAdd: (memberIds: string[]) => void;
	onCancel?: (() => void) | undefined;
}

/**
 * The owner adds people from their own contacts (19 3.1). A Bot the owner already has is a contact
 * too, so it can be added; anyone already in the group cannot.
 */
export function AddMembers({ conversation, adding, error, inPage, onAdd, onCancel }: AddMembersProps) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const conversations = useConversations();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const items = addableContacts(contacts.data?.items ?? [], conversation.members);
	const eligible = new Map(items.map((member) => [member.id, member]));
	const selectedIds = selected.filter((id) => eligible.has(id));
	const needle = query.trim();
	const visible = filterContacts(items, needle);
	const room = Math.max(0, GROUP_MEMBER_LIMIT - conversation.members.length);
	const recent = needle ? [] : recentContacts(conversations.data?.items ?? [], eligible, conversation.ownerId);

	const rows = (members: Member[]) =>
		members.map((member) => {
			const checked = selectedIds.includes(member.id);
			return (
				<Checkbox
					key={member.id}
					checked={checked}
					disabled={adding || (selectedIds.length >= room && !checked)}
					onChange={(event) =>
						setSelected(
							event.target.checked ? [...selectedIds, member.id] : selectedIds.filter((id) => id !== member.id),
						)
					}
					className="flex items-center gap-[var(--spacing-3)] rounded-[var(--radius-control)] px-[var(--spacing-2)] py-[var(--spacing-3)] hover:bg-[var(--color-bg-hover)] [&>span:last-child]:min-w-0"
				>
					<span className="flex min-w-0 items-center gap-[var(--spacing-3)]">
						<Avatar
							name={member.displayName}
							src={member.avatarUrl}
							kind={member.kind}
							color={member.avatarColor}
							size={32}
						/>
						<span className="truncate text-body text-[var(--color-text-primary)]">{member.displayName}</span>
					</span>
				</Checkbox>
			);
		});

	return (
		<div className={cn("flex flex-col gap-[var(--spacing-4)]", inPage && "h-full min-h-0")}>
			<SearchInput
				placeholder={t("chatActions.searchContacts")}
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				aria-label={t("chatActions.searchContacts")}
			/>
			{contacts.isLoading ? <p role="status">{t("app.loading")}</p> : null}
			{contacts.isError ? (
				<div className="flex flex-col gap-[var(--spacing-2)]">
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{memberFailureText(contacts.error, t)}
					</p>
					<Button size="sm" onClick={() => void contacts.refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			) : null}
			{contacts.isSuccess && !visible.length ? (
				<p className="text-caption text-[var(--color-text-secondary)]">
					{t(items.length ? "chatActions.noResults" : "members.group.noContacts")}
				</p>
			) : null}
			<div className={cn("min-h-0 overflow-y-auto overscroll-contain", inPage ? "flex-1" : "max-h-[40dvh]")}>
				{recent.length ? (
					<fieldset className="mb-[var(--spacing-4)] flex min-w-0 flex-col">
						<legend className="px-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
							{t("members.group.recentContacts")}
						</legend>
						{rows(recent)}
					</fieldset>
				) : null}
				{visible.length ? (
					<fieldset
						className="flex min-w-0 flex-col"
						aria-label={needle ? t("members.group.selectMembers") : undefined}
					>
						{!needle ? (
							<legend className="px-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
								{t("members.group.allContacts")}
							</legend>
						) : null}
						{rows(visible)}
					</fieldset>
				) : null}
			</div>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{memberFailureText(error, t)}
				</p>
			) : null}
			<div className="flex shrink-0 items-center justify-end gap-[var(--spacing-3)]">
				{selectedIds.length ? (
					<span className="mr-auto text-caption text-[var(--color-text-secondary)]">
						{t("chatActions.selected", { count: selectedIds.length })}
					</span>
				) : null}
				{onCancel ? (
					<Button onClick={onCancel} disabled={adding}>
						{t("app.cancel")}
					</Button>
				) : null}
				<Button
					variant="primary"
					loading={adding}
					disabled={!selectedIds.length || selectedIds.length > room}
					onClick={() => onAdd(selectedIds)}
				>
					{t("members.group.add")}
				</Button>
			</div>
		</div>
	);
}
