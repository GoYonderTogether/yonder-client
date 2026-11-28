import { MemberRow } from "@yonder/feature-members";
import { Button, ContactsGlyph, EmptyState, ListGroup, Segmented } from "@yonder/ui-components";
import { useContacts, useConversations, useFriendRequests, usePerson } from "@yonder/ui-data";
import { ListFrame, PageFrame, useOptionalSidePanel } from "@yonder/ui-shell";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { GroupRows, splitContacts } from "./contacts-sections.tsx";
import { FriendRequestCard } from "./friend-request-card.tsx";
import { type MemberCardHandlers, MemberCardView } from "./member-card.tsx";

export interface ContactPosition {
	handle: string;
	scrollTop: number;
}

interface ContactsListProps {
	/** Opens the contact in the page's own content pane instead of the side panel. */
	inline?: boolean | undefined;
	onOpen: (handle: string) => void;
	overlay?: { close: () => void; reopen: () => void; position: RefObject<ContactPosition | null> } | undefined;
	/** Opens a group chat's conversation; without it the group section is not shown. */
	onOpenGroup?: ((conversationId: string) => void) | undefined;
}

export function ContactsList({ onOpen, overlay, onOpenGroup, inline = false }: ContactsListProps) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const conversations = useConversations();
	const personId = usePerson()?.id;
	const openMember = useOptionalSidePanel()?.openMember;
	const sections = splitContacts(contacts.data?.items, conversations.data?.items, personId);
	const groups = onOpenGroup ? sections.groups : [];
	/** Bots then friends: the order their buttons appear in the DOM, so a saved row maps to an index. */
	const people = contacts.data ? [...sections.bots, ...sections.friends] : undefined;
	const rows = useRef<HTMLDivElement>(null);
	const position = overlay?.position;
	useLayoutEffect(() => {
		const saved = position?.current;
		const list = rows.current;
		const index = people?.findIndex(({ handle }) => handle === saved?.handle) ?? -1;
		const button = list?.querySelectorAll<HTMLButtonElement>("li > button").item(index);
		const scrollPanel = list?.closest<HTMLElement>("[data-overlay-body]");
		if (!position || !saved || !button || !scrollPanel) return;
		const frame = requestAnimationFrame(() => {
			position.current = null;
			scrollPanel.scrollTop = saved.scrollTop;
			button.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [people, position]);
	return (
		<>
			{contacts.isPending ? <p role="status">{t("app.loading")}</p> : null}
			{contacts.isError ? (
				<Button variant="link" onClick={() => void contacts.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			<div ref={rows} className="flex flex-col">
				{[
					{ key: "bots", title: t("chatActions.contactsBots"), items: sections.bots },
					{ key: "friends", title: t("chatActions.contactsFriends"), items: sections.friends },
				]
					.filter((section) => section.items.length > 0)
					.map((section) => (
						<ListGroup key={section.key} title={section.title}>
							{section.items.map((member) => (
								<MemberRow
									key={member.id}
									member={member}
									onOpen={() => {
										if (!openMember || inline) return onOpen(member.handle);
										const scrollTop = rows.current?.closest<HTMLElement>("[data-overlay-body]")?.scrollTop ?? 0;
										openMember(
											member.handle,
											member.displayName,
											overlay &&
												(() => {
													overlay.position.current = { handle: member.handle, scrollTop };
													overlay.reopen();
												}),
										);
										overlay?.close();
									}}
								/>
							))}
						</ListGroup>
					))}
			</div>
			{onOpenGroup ? <GroupRows groups={groups} personId={personId} onOpen={onOpenGroup} /> : null}
			{!contacts.isError && people?.length === 0 && groups.length === 0 ? (
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
	onOpenGroup,
	showRequests,
	onChange,
}: ContactsViewProps & {
	onOpen: (handle: string) => void;
	onOpenGroup: (conversationId: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<ListFrame
			title={t("chatActions.contacts")}
			center={<ContactsViewSwitch showRequests={showRequests} onChange={onChange} />}
		>
			<div className="px-[var(--spacing-2)]">
				{showRequests ? <FriendRequestsList /> : <ContactsList inline onOpen={onOpen} onOpenGroup={onOpenGroup} />}
			</div>
		</ListFrame>
	);
}

export function ContactsDialogList({ onOpen, overlay, onOpenGroup }: ContactsListProps) {
	const [showRequests, setShowRequests] = useState(false);
	return (
		<>
			<div className="sticky top-0 z-10 bg-[var(--color-bg-surface)] p-[var(--spacing-4)]">
				<ContactsViewSwitch showRequests={showRequests} onChange={setShowRequests} />
			</div>
			<div className="px-[var(--spacing-4)] pb-[calc(var(--spacing-4)+var(--safe-area-bottom,env(safe-area-inset-bottom)))]">
				{showRequests ? (
					<FriendRequestsList />
				) : (
					<ContactsList onOpen={onOpen} overlay={overlay} onOpenGroup={onOpenGroup} />
				)}
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
