import { MemberRow } from "@yonder/feature-members";
import { Button, ContactsGlyph, EmptyState, Segmented } from "@yonder/ui-components";
import { useContacts, useFriendRequests } from "@yonder/ui-data";
import { ListFrame, PageFrame } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FriendRequestCard } from "./friend-request-card.tsx";
import { type MemberCardHandlers, MemberCardView } from "./member-card.tsx";

export function ContactsList({ onOpen }: { onOpen: (handle: string) => void }) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const people = contacts.data?.items.filter((member) => member.kind === "person");
	return (
		<>
			{contacts.isPending ? <p role="status">{t("app.loading")}</p> : null}
			{contacts.isError ? (
				<Button variant="link" onClick={() => void contacts.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			<ul aria-label={t("chatActions.contacts")}>
				{people?.map((member) => (
					<MemberRow key={member.id} member={member} onOpen={() => onOpen(member.handle)} />
				))}
			</ul>
			{!contacts.isError && people?.length === 0 ? (
				<p className="px-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
					{t("chatActions.contactsEmpty")}
				</p>
			) : null}
		</>
	);
}

function FriendRequestsList() {
	const { t } = useTranslation();
	const requests = useFriendRequests();
	const items = requests.data?.items ?? [];
	return (
		<div className="flex flex-col gap-[var(--spacing-2)]">
			{requests.isPending ? <p role="status">{t("app.loading")}</p> : null}
			{requests.isError ? (
				<Button variant="link" onClick={() => void requests.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			{requests.data && !requests.isError && items.length === 0 ? (
				<p className="px-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
					{t("friendRequests.empty")}
				</p>
			) : null}
			{items
				.toSorted((a, b) => Number(a.status === "accepted") - Number(b.status === "accepted"))
				.map((request) => (
					<FriendRequestCard key={request.id} id={request.id} compact />
				))}
		</div>
	);
}

interface ContactsViewProps {
	showRequests: boolean;
	onChange: (showRequests: boolean) => void;
}

function ContactsViewSwitch({ showRequests, onChange }: ContactsViewProps) {
	const { t } = useTranslation();
	return (
		<Segmented
			aria-label={t("chatActions.contacts")}
			size="lg"
			options={[
				{ value: "contacts", label: t("chatActions.contacts") },
				{ value: "requests", label: t("friendRequests.title") },
			]}
			value={showRequests ? "requests" : "contacts"}
			onChange={(value) => onChange(value === "requests")}
		/>
	);
}

export function ContactsPageList({
	onOpen,
	showRequests,
	onChange,
}: ContactsViewProps & {
	onOpen: (handle: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<ListFrame
			title={t("chatActions.contacts")}
			center={<ContactsViewSwitch showRequests={showRequests} onChange={onChange} />}
		>
			<div className="px-[var(--spacing-2)]">
				{showRequests ? <FriendRequestsList /> : <ContactsList onOpen={onOpen} />}
			</div>
		</ListFrame>
	);
}

export function ContactsDialogList({ onOpen }: { onOpen: (handle: string) => void }) {
	const [showRequests, setShowRequests] = useState(false);
	return (
		<>
			<div className="sticky top-0 z-10 bg-[var(--color-bg-surface)] p-[var(--spacing-4)]">
				<ContactsViewSwitch showRequests={showRequests} onChange={setShowRequests} />
			</div>
			<div className="px-[var(--spacing-4)] pb-[calc(var(--spacing-4)+var(--safe-area-bottom,env(safe-area-inset-bottom)))]">
				{showRequests ? <FriendRequestsList /> : <ContactsList onOpen={onOpen} />}
			</div>
		</>
	);
}

export function ContactsPagePlaceholder() {
	const { t } = useTranslation();
	return (
		<PageFrame>
			<div className="flex flex-1 items-center justify-center">
				<EmptyState icon={<ContactsGlyph size={24} aria-hidden="true" />} title={t("chatActions.contactsSelect")} />
			</div>
		</PageFrame>
	);
}

export function ContactProfile({ handle, ...handlers }: { handle: string } & MemberCardHandlers) {
	return (
		<PageFrame>
			<MemberCardView key={handle} handle={handle} {...handlers} />
		</PageFrame>
	);
}
