import { addableFor, groupMemberRights } from "@yonder/chat-model";
import type { Conversation, ConversationMember } from "@yonder/protocol";
import { Avatar, ListGroup, ListRow } from "@yonder/ui-components";
import { useContacts, useGroupActions, useMe } from "@yonder/ui-data";
import { Overlay, useShellChrome, useSidePanel } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { memberFailureText } from "../profile/failure.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { GroupActions, GroupExit } from "./group-actions.tsx";
import { GroupAddMembers, GroupAddMembersPage, GroupBotSettings, GroupMembersPage } from "./group-pages.tsx";
import { GroupTitle } from "./group-title.tsx";
import type { Translate } from "./system-events.ts";

export interface GroupInfoProps {
	conversation: Conversation;
	/** The viewer's member id; ownership is compared by id, not guessed from `role`. */
	personId?: string | undefined;
	/** Opens a member's card (a person's profile or another person's Bot). */
	onOpenMember?: ((member: ConversationMember) => void) | undefined;
	/** The group dropped out of the viewer's list (they left): the caller closes the page. */
	onLeft?: (() => void) | undefined;
	preferences?: ReactNode;
}

/** The row of avatars shows this many; "all members" is the way to the rest (17 3.2). */
const FACE_LIMIT = 8;

type Confirm =
	| { kind: "dissolve" }
	| { kind: "leave" }
	| { kind: "remove"; member: ConversationMember }
	| { kind: "transfer"; member: ConversationMember }
	| null;

/**
 * Group info (17 3.2): the name, who is in it, and the few things the viewer may do. The owner
 * renames, adds people, hands the group over and dissolves it; a member can leave, and bring in or
 * take out their own Bots. A closed group keeps the name and the member list and loses every action
 * (19 3.2).
 */
export function GroupInfo({ conversation, personId, onOpenMember, onLeft, preferences }: GroupInfoProps) {
	const { t } = useTranslation();
	const { mode, desktop } = useShellChrome();
	const side = useSidePanel();
	const me = useMe().data?.member.id;
	// The caller may pass the viewer explicitly (a page that already has it); the session is the fallback.
	const person = personId ?? me;
	const owner = Boolean(conversation.ownerId) && person === conversation.ownerId;
	const closed = Boolean(conversation.closedReason);
	const contacts = useContacts();
	// A member who is not the owner has one row here, and only while one of their Bots is left to add.
	const canAdd =
		groupMemberRights(conversation, person).addOwnBots &&
		(owner || addableFor(conversation, contacts.data?.items ?? [], person).length > 0);
	const actions = useGroupActions(conversation.id);
	const [transferring, setTransferring] = useState(false);
	const [adding, setAdding] = useState(false);
	const [confirm, setConfirm] = useState<Confirm>(null);
	const [error, setError] = useState<string | null>(null);
	const addId = useId();
	const addCount = useRef(0);

	const busy =
		actions.rename.isPending ||
		actions.removeMember.isPending ||
		actions.leave.isPending ||
		actions.transferOwner.isPending ||
		actions.dissolve.isPending;
	const fail = (failure: unknown) => setError(memberFailureText(failure, t));
	const done = (close: () => void) => () => {
		setError(null);
		close();
	};
	const ask = (value: Confirm) => {
		setError(null);
		setConfirm(value);
	};
	const openAddMembers = () => {
		if (desktop) {
			setAdding(true);
			return;
		}
		const key = `group-add-members:${addId}:${++addCount.current}`;
		side.push({
			key,
			title: t("members.group.addMembers"),
			content: <GroupAddMembersPage conversationId={conversation.id} personId={person} onDone={() => side.back(key)} />,
		});
	};

	return (
		<div className="flex min-h-full flex-col gap-[var(--spacing-5)] p-[var(--spacing-4)]">
			<GroupTitle
				title={conversation.title ?? ""}
				members={conversation.members}
				editable={owner && !closed}
				saving={actions.rename.isPending}
				onRename={actions.rename.mutateAsync}
			/>

			<div className="flex flex-col gap-[var(--spacing-3)]">
				<div className="flex items-center justify-between gap-[var(--spacing-3)] px-[var(--spacing-1)]">
					<span className="text-caption text-[var(--color-text-secondary)]">
						{t("members.group.memberCount", { count: conversation.members.length })}
					</span>
					<button
						type="button"
						onClick={() =>
							side.push({
								key: "group-members",
								title: t("members.group.allMembers"),
								content: (
									<GroupMembersPage
										conversationId={conversation.id}
										personId={person}
										onOpenMember={onOpenMember}
										onRemove={(member) => ask({ kind: "remove", member })}
										onTransfer={(member) => ask({ kind: "transfer", member })}
									/>
								),
							})
						}
						className="rounded-[var(--radius-sm)] text-caption text-[var(--color-accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
					>
						{t("members.group.allMembers")}
					</button>
				</div>
				<div className="flex flex-wrap gap-[var(--spacing-3)] px-[var(--spacing-1)]">
					{conversation.members.slice(0, FACE_LIMIT).map((member) => (
						<Avatar
							key={member.memberId}
							name={member.displayName}
							src={member.avatarUrl}
							color={member.avatarColor}
							kind={member.kind}
							size={40}
						/>
					))}
				</div>
			</div>

			{closed ? null : preferences}

			{error && !confirm ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}

			{(owner || canAdd) && !closed ? (
				<GroupActions
					conversation={conversation}
					busy={busy}
					owner={owner}
					onAddMembers={openAddMembers}
					onTransfer={() => setTransferring(true)}
					onBotSettings={() =>
						side.push({
							key: "group-bot-settings",
							title: t("members.group.botSettings"),
							content: <GroupBotSettings conversationId={conversation.id} personId={person} />,
						})
					}
				/>
			) : null}
			{closed ? null : (
				<GroupExit owner={owner} busy={busy} onClick={() => ask({ kind: owner ? "dissolve" : "leave" })} />
			)}

			<Overlay
				open={adding && (owner || canAdd) && !closed}
				onClose={() => setAdding(false)}
				title={t(owner ? "members.group.addMembers" : "members.group.addOwnBot")}
				closeLabel={t("app.close")}
				mode={mode}
				mobilePresentation="sheet"
			>
				<GroupAddMembers conversation={conversation} personId={person} onDone={() => setAdding(false)} />
			</Overlay>

			<Overlay
				open={transferring && owner && !closed}
				onClose={() => setTransferring(false)}
				title={t("members.group.transferPick")}
				closeLabel={t("app.close")}
				mobileBackLabel={t("app.back")}
				mode={mode}
				mobilePresentation={desktop ? "sheet" : "page"}
			>
				<div className="p-[var(--spacing-3)]">
					<ListGroup>
						{conversation.members
							.filter((member) => member.kind === "person" && member.memberId !== person)
							.map((member) => (
								<ListRow
									key={member.memberId}
									leading={
										<Avatar
											name={member.displayName}
											src={member.avatarUrl}
											color={member.avatarColor}
											kind={member.kind}
											size={32}
										/>
									}
									title={member.displayName}
									onClick={() => {
										setTransferring(false);
										ask({ kind: "transfer", member });
									}}
								/>
							))}
					</ListGroup>
				</div>
			</Overlay>

			<ConfirmDialog
				open={confirm !== null}
				title={confirmTitle(confirm, t)}
				body={confirmBody(confirm, t)}
				confirmLabel={confirmLabel(confirm, t)}
				busy={busy}
				error={error}
				onCancel={() => ask(null)}
				onConfirm={() => {
					if (confirm?.kind === "dissolve")
						actions.dissolve.mutate(undefined, { onSuccess: done(() => setConfirm(null)), onError: fail });
					else if (confirm?.kind === "leave")
						actions.leave.mutate(undefined, {
							onSuccess: done(() => {
								setConfirm(null);
								onLeft?.();
							}),
							onError: fail,
						});
					else if (confirm?.kind === "remove")
						actions.removeMember.mutate(confirm.member.memberId, {
							onSuccess: done(() => setConfirm(null)),
							onError: fail,
						});
					else if (confirm?.kind === "transfer")
						actions.transferOwner.mutate(
							{ memberId: confirm.member.memberId },
							{
								onSuccess: done(() => setConfirm(null)),
								onError: fail,
							},
						);
				}}
			/>
		</div>
	);
}

function confirmTitle(confirm: Confirm, t: Translate): string {
	if (confirm?.kind === "dissolve") return t("members.group.dissolveTitle");
	if (confirm?.kind === "leave") return t("members.group.leaveTitle");
	if (confirm?.kind === "remove") return t("members.group.removeTitle", { name: confirm.member.displayName });
	if (confirm?.kind === "transfer") return t("members.group.transferTitle", { name: confirm.member.displayName });
	return "";
}

function confirmBody(confirm: Confirm, t: Translate): string {
	if (confirm?.kind === "dissolve") return t("members.group.dissolveBody");
	if (confirm?.kind === "leave") return t("members.group.leaveBody");
	if (confirm?.kind === "remove") return t("members.group.removeBody");
	if (confirm?.kind === "transfer") return t("members.group.transferBody");
	return "";
}

function confirmLabel(confirm: Confirm, t: Translate): string {
	if (confirm?.kind === "dissolve") return t("members.group.confirmDissolve");
	if (confirm?.kind === "leave") return t("members.group.confirmLeave");
	if (confirm?.kind === "transfer") return t("members.group.confirmTransfer");
	return t("members.group.confirmRemove");
}
