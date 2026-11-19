import { Avatar, Button, Checkbox, cn, SearchInput, TextField } from "@yonder/ui-components";
import { useContactActions, useContacts } from "@yonder/ui-data";
import { useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionError } from "./action-error.tsx";

export function CreateGroup({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
	const { t } = useTranslation();
	const { mode, desktop } = useShellChrome();
	const contacts = useContacts();
	const { createGroup } = useContactActions();
	const [query, setQuery] = useState("");
	const [name, setName] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const items = contacts.data?.items ?? [];
	const visible = items.filter((member) =>
		`${member.displayName} ${member.handle}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
	);
	return (
		<form
			className="flex grow flex-col"
			onSubmit={(event) => {
				event.preventDefault();
				if (selected.length >= 2)
					createGroup.mutate(
						{ memberIds: selected, ...(name.trim() ? { title: name.trim() } : {}) },
						{ onSuccess: (conversation) => onCreated(conversation.id) },
					);
			}}
		>
			<div
				className={cn(
					"grid min-h-0 grow",
					desktop && mode === "wide"
						? "grid-cols-[repeat(auto-fit,minmax(min(100%,var(--group-form-column-min)),1fr))]"
						: "grid-cols-1 sm:grid-cols-2",
				)}
			>
				<div className="flex min-w-0 flex-col gap-[var(--spacing-4)] bg-[var(--color-bg-subtle)] p-[var(--spacing-5)]">
					<SearchInput
						placeholder={t("chatActions.searchContacts")}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					{contacts.isLoading ? <p role="status">{t("app.loading")}</p> : null}
					{contacts.isError ? <Button onClick={() => void contacts.refetch()}>{t("app.retry")}</Button> : null}
					{contacts.isSuccess && !items.length ? (
						<p className="text-caption text-[var(--color-text-secondary)]">{t("chatActions.contactsEmpty")}</p>
					) : null}
					<fieldset
						className="flex max-h-[40dvh] flex-col overflow-y-auto"
						aria-label={t("chatActions.selectContacts")}
					>
						{visible.map((member) => (
							<Checkbox
								key={member.id}
								checked={selected.includes(member.id)}
								disabled={createGroup.isPending || (selected.length >= 99 && !selected.includes(member.id))}
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
				</div>
				<div className="flex min-w-0 flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)]">
					<TextField
						label={t("chatActions.groupName")}
						placeholder={t("chatActions.groupNamePlaceholder")}
						value={name}
						onChange={(event) => setName(event.target.value)}
						maxLength={80}
					/>
					<p className="text-caption text-[var(--color-text-secondary)]">
						{t("chatActions.selected", { count: selected.length })}
					</p>
					<div className="flex flex-wrap gap-[var(--spacing-2)]">
						{items
							.filter((member) => selected.includes(member.id))
							.map((member) => (
								<Button
									key={member.id}
									size="sm"
									disabled={createGroup.isPending}
									aria-label={`${t("app.remove")} ${member.displayName}`}
									onClick={() => setSelected((current) => current.filter((id) => id !== member.id))}
								>
									{member.displayName}
								</Button>
							))}
					</div>
					<ActionError error={createGroup.error} />
				</div>
			</div>
			<div className="flex justify-end gap-[var(--spacing-3)] border-t border-[var(--color-border-subtle)] p-[var(--spacing-5)]">
				<Button onClick={onCancel} disabled={createGroup.isPending}>
					{t("app.cancel")}
				</Button>
				<Button type="submit" variant="primary" loading={createGroup.isPending} disabled={selected.length < 2}>
					{t("app.done")}
				</Button>
			</div>
		</form>
	);
}
