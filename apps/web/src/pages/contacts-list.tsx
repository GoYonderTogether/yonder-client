import { MemberRow } from "@yonder/feature-members";
import { Button } from "@yonder/ui-components";
import { useContacts, useFriendRequests } from "@yonder/ui-data";
import { type LayoutMode, Overlay } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { FriendRequestCard } from "./friend-request-card.tsx";

export function ContactsList({ onOpen }: { onOpen: (handle: string) => void }) {
	const { t } = useTranslation();
	const contacts = useContacts();
	const requests = useFriendRequests();
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
				{contacts.data?.items
					.filter((member) => member.kind === "person")
					.map((member) => (
						<MemberRow key={member.id} member={member} onOpen={() => onOpen(member.handle)} />
					))}
			</ul>
		</div>
	);
}

/** The contacts list as a dialog over the frame; opening a contact goes to their card. */
export function ContactsOverlay({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: LayoutMode }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	return (
		<Overlay open={open} onClose={onClose} title={t("chatActions.contacts")} closeLabel={t("app.close")} mode={mode}>
			<ContactsList
				onOpen={(handle) => {
					onClose();
					navigate(`/@${encodeURIComponent(handle)}`);
				}}
			/>
		</Overlay>
	);
}
