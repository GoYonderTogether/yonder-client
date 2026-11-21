import { MemberRow } from "@yonder/feature-members";
import { Button, EmptyState } from "@yonder/ui-components";
import { useContacts, useFriendRequests } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { ContactRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FriendRequestCard } from "./friend-request-card.tsx";

export function ContactsList({ onOpen, emptyLabel }: { onOpen: (handle: string) => void; emptyLabel?: string }) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const requests = useFriendRequests();
	const people = contacts.data?.items.filter((member) => member.kind === "person");
	return (
		<div className="p-[var(--spacing-4)]">
			{contacts.isPending ? <p role="status">{t("app.loading")}</p> : null}
			{contacts.isError ? (
				<Button variant="link" onClick={() => void contacts.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			{requests.isError ? (
				<Button variant="link" onClick={() => void requests.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			{requests.data?.items.length ? (
				<section className="mb-[var(--spacing-4)] flex flex-col gap-[var(--spacing-2)]">
					<h2 className="text-body font-medium">{t("friendRequests.title")}</h2>
					{requests.data.items.map((request) => (
						<FriendRequestCard key={request.id} id={request.id} />
					))}
				</section>
			) : null}
			<ul aria-label={t("chatActions.contacts")}>
				{people?.map((member) => (
					<MemberRow key={member.id} member={member} onOpen={() => onOpen(member.handle)} />
				))}
			</ul>
			{emptyLabel && !contacts.isError && people?.length === 0 ? (
				<p className="px-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">{emptyLabel}</p>
			) : null}
		</div>
	);
}

export function ContactsPageList({ onOpen }: { onOpen: (handle: string) => void }) {
	const { t } = useTranslation();
	return (
		<ListFrame title={t("chatActions.contacts")}>
			<ContactsList onOpen={onOpen} emptyLabel={t("chatActions.contactsEmpty")} />
		</ListFrame>
	);
}

export function ContactsPagePlaceholder() {
	const { t } = useTranslation();
	return (
		<PageFrame>
			<div className="flex flex-1 items-center justify-center">
				<EmptyState
					icon={<ContactRound size={24} strokeWidth={1.6} aria-hidden="true" />}
					title={t("chatActions.contactsSelect")}
				/>
			</div>
		</PageFrame>
	);
}
