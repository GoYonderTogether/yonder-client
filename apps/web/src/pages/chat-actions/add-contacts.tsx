import { Avatar, BrandedQrCode, Button, SearchInput } from "@yonder/ui-components";
import { useContactActions, useContactSearch, usePerson } from "@yonder/ui-data";
import { ChevronRight, Gift, ScanLine } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { shouldShowScanner } from "../../lib/platform.ts";
import { ActionError } from "./action-error.tsx";

export function AddContacts({
	initialQuery = "",
	onOpen,
	onScan,
	onInvite,
}: {
	initialQuery?: string;
	onOpen: (id: string) => void;
	onScan?: () => void;
	onInvite?: () => void;
}) {
	const { t } = useTranslation();
	const person = usePerson();
	const [input, setInput] = useState(initialQuery);
	const [query, setQuery] = useState(initialQuery.replace(/^@/, ""));
	const results = useContactSearch(query);
	const { addContact } = useContactActions();
	const [added, setAdded] = useState<Record<string, string>>({});
	return (
		<div className="flex flex-col gap-[var(--spacing-6)] p-[var(--spacing-5)]">
			<form
				className="flex items-center gap-[var(--spacing-2)]"
				onSubmit={(event) => {
					event.preventDefault();
					setQuery(input.trim().replace(/^@/, ""));
				}}
			>
				<div className="min-w-0 flex-1">
					<SearchInput
						placeholder={t("chatActions.searchPlaceholder")}
						value={input}
						onChange={(event) => {
							setInput(event.target.value);
							if (!event.target.value.trim()) setQuery("");
						}}
						maxLength={40}
						fieldSize="lg"
						required
					/>
				</div>
				{input.trim() ? (
					<Button type="submit" variant="primary" loading={results.isFetching}>
						{t("chatActions.search")}
					</Button>
				) : null}
			</form>
			{!query && !input.trim() ? (
				<div className="flex flex-col">
					{onScan && shouldShowScanner() ? (
						<ContactEntry
							icon={ScanLine}
							title={t("chatActions.scan")}
							description={t("friendQr.scanDescription")}
							onClick={onScan}
						/>
					) : null}
					{onInvite ? (
						<ContactEntry
							icon={Gift}
							title={t("friendQr.inviteTitle")}
							description={t("friendQr.inviteDescription")}
							onClick={onInvite}
						/>
					) : null}
				</div>
			) : null}
			<ActionError error={results.error ?? addContact.error} />
			{query && results.isSuccess && !results.data.items.length ? (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t("chatActions.noResults")}
				</p>
			) : null}
			{results.data?.items.map((member) => (
				<div
					key={member.id}
					className="flex min-w-0 items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] p-[var(--spacing-3)]"
				>
					<Avatar
						name={member.displayName}
						src={member.avatarUrl}
						kind={member.kind}
						color={member.avatarColor}
						size={40}
					/>
					<div className="min-w-0 flex-1">
						<p className="truncate text-body font-medium">{member.displayName}</p>
						<p className="truncate text-caption text-[var(--color-text-secondary)]">@{member.handle}</p>
						{added[member.id] ? (
							<p role="status" className="text-caption text-[var(--color-text-secondary)]">
								{t("chatActions.added")}
							</p>
						) : null}
					</div>
					{added[member.id] ? (
						<Button size="sm" onClick={() => onOpen(added[member.id] as string)}>
							{t("chatActions.message")}
						</Button>
					) : (
						<Button
							size="sm"
							loading={addContact.isPending && addContact.variables === member.id}
							disabled={addContact.isPending}
							onClick={() =>
								addContact.mutate(member.id, {
									onSuccess: ({ conversation }) => {
										setAdded((current) => ({ ...current, [member.id]: conversation.id }));
									},
								})
							}
						>
							{t("chatActions.add")}
						</Button>
					)}
				</div>
			))}
			{!query && !input.trim() && person?.handle ? (
				<div className="flex flex-col items-center gap-[var(--spacing-2)] py-[var(--spacing-8)]">
					<BrandedQrCode value={`@${person.handle}`} label={t("friendQr.myCode")} />
					<p className="text-body font-medium">{person.displayName}</p>
					<p className="text-caption text-[var(--color-text-secondary)]">@{person.handle}</p>
					<p className="text-caption text-[var(--color-text-secondary)]">{t("friendQr.myCodeDescription")}</p>
				</div>
			) : null}
		</div>
	);
}

function ContactEntry({
	icon: Icon,
	title,
	description,
	onClick,
}: {
	icon: typeof ScanLine;
	title: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-[var(--spacing-5)] border-b border-[var(--color-border-subtle)] py-[var(--spacing-6)] text-start hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			<Icon size={24} aria-hidden="true" className="shrink-0 text-[var(--color-accent)]" />
			<span className="min-w-0 flex-1">
				<span className="block text-h2 text-[var(--color-text-primary)]">{title}</span>
				<span className="mt-[var(--spacing-1)] block text-body text-[var(--color-text-secondary)]">{description}</span>
			</span>
			<ChevronRight size={20} aria-hidden="true" className="shrink-0 text-[var(--color-text-tertiary)]" />
		</button>
	);
}
