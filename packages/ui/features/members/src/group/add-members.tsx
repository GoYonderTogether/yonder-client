import type { Conversation, Member } from "@yonder/protocol";
import { Avatar, Button, Checkbox, SearchInput } from "@yonder/ui-components";
import { useContacts } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { memberFailureText } from "../profile/failure.ts";

/** The same ceiling `createGroup` enforces, for the same reason: message fan-out per group (19 3.1). */
const MAX_MEMBERS = 99;

export interface AddMembersProps {
	/** The group as it is now; people already in it are not offered again. */
	conversation: Conversation;
	adding: boolean;
	error: unknown;
	onAdd: (memberIds: string[]) => void;
	onCancel: () => void;
}

/**
 * The owner adds people from their own contacts (19 3.1). A Bot the owner already has is a contact
 * too, so it can be added; anyone already in the group cannot.
 */
export function AddMembers({ conversation, adding, error, onAdd, onCancel }: AddMembersProps) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const present = new Set(conversation.members.map((member) => member.memberId));
	const items = (contacts.data?.items ?? []).filter((member: Member) => !present.has(member.id));
	const needle = query.trim().toLocaleLowerCase();
	const visible = needle
		? items.filter((member) => `${member.displayName} ${member.handle}`.toLocaleLowerCase().includes(needle))
		: items;
	const room = Math.max(0, MAX_MEMBERS - conversation.members.length);

	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
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
			{contacts.isSuccess && !items.length ? (
				<p className="text-caption text-[var(--color-text-secondary)]">{t("members.group.noContacts")}</p>
			) : null}
			<fieldset className="flex max-h-[40dvh] flex-col overflow-y-auto" aria-label={t("members.group.selectMembers")}>
				{visible.map((member) => (
					<Checkbox
						key={member.id}
						checked={selected.includes(member.id)}
						disabled={adding || (selected.length >= room && !selected.includes(member.id))}
						onChange={(event) =>
							setSelected((current) =>
								event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id),
							)
						}
						className="flex items-center gap-[var(--spacing-3)] rounded-[var(--radius-control)] px-[var(--spacing-2)] py-[var(--spacing-3)] hover:bg-[var(--color-bg-hover)]"
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
				))}
			</fieldset>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{memberFailureText(error, t)}
				</p>
			) : null}
			<div className="flex justify-end gap-[var(--spacing-3)]">
				<Button onClick={onCancel} disabled={adding}>
					{t("app.cancel")}
				</Button>
				<Button variant="primary" loading={adding} disabled={!selected.length} onClick={() => onAdd(selected)}>
					{t("members.group.add")}
				</Button>
			</div>
		</div>
	);
}
