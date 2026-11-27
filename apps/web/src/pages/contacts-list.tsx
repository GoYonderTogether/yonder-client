import { MemberRow } from "@yonder/feature-members";
import { Button, ContactsGlyph, EmptyState } from "@yonder/ui-components";
import { useContacts, useFriendRequests } from "@yonder/ui-data";
import { ListFrame, PageFrame, useOptionalSidePanel } from "@yonder/ui-shell";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { FriendRequestCard } from "./friend-request-card.tsx";

export interface ContactPosition {
	handle: string;
	scrollTop: number;
}

export function ContactsList({
	onOpen,
	overlay,
	emptyLabel,
}: {
	onOpen: (handle: string) => void;
	overlay?: { close: () => void; reopen: () => void; position: RefObject<ContactPosition | null> };
	emptyLabel?: string;
}) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const requests = useFriendRequests();
	const openMember = useOptionalSidePanel()?.openMember;
	const people = contacts.data?.items.filter((member) => member.kind === "person");
	const rows = useRef<HTMLUListElement>(null);
	const position = overlay?.position;
	useLayoutEffect(() => {
		const saved = position?.current;
		const list = rows.current;
		const index = people?.findIndex(({ handle }) => handle === saved?.handle) ?? -1;
		const button = list?.children.item(index)?.querySelector("button");
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
			<ul ref={rows} aria-label={t("chatActions.contacts")}>
				{people?.map((member) => (
					<MemberRow
						key={member.id}
						member={member}
						onOpen={() => {
							if (!openMember) return onOpen(member.handle);
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
				<EmptyState icon={<ContactsGlyph size={24} aria-hidden="true" />} title={t("chatActions.contactsSelect")} />
			</div>
		</PageFrame>
	);
}
