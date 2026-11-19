import type { Conversation, ConversationMember } from "@yonder/protocol";
import { useConversations, useGroupActions } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { memberFailureText } from "../profile/failure.ts";
import { AddMembers } from "./add-members.tsx";
import { MemberList } from "./member-list.tsx";

function useGroupConversation(conversationId: string) {
	return useConversations().data?.items.find((item) => item.id === conversationId && item.kind === "group");
}

interface GroupPageProps {
	conversationId: string;
	personId: string | undefined;
}

export function GroupBotSettings({ conversationId, personId }: GroupPageProps) {
	const { t } = useTranslation();
	const group = useGroupConversation(conversationId);
	const { setBotPayer } = useGroupActions(conversationId);
	if (group?.groupBotPayer === undefined) return null;
	return (
		<div className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-4)]">
			<label className="flex flex-wrap items-center justify-between gap-[var(--spacing-3)] text-body">
				{t("members.group.botPayer")}
				<select
					className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--spacing-2)] text-[var(--color-text-primary)]"
					value={group.groupBotPayer}
					disabled={
						setBotPayer.isPending || Boolean(group.closedReason) || !group.ownerId || group.ownerId !== personId
					}
					onChange={(event) => setBotPayer.mutate(event.currentTarget.value === "owner" ? "owner" : "mentioner")}
				>
					<option value="mentioner">{t("members.group.botPayerMentioner")}</option>
					<option value="owner">{t("members.group.botPayerOwner")}</option>
				</select>
			</label>
			{setBotPayer.error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{memberFailureText(setBotPayer.error, t)}
				</p>
			) : null}
		</div>
	);
}

export function GroupMembersPage({
	conversationId,
	personId,
	onOpenMember,
	onRemove,
	onTransfer,
}: GroupPageProps & {
	onOpenMember: ((member: ConversationMember) => void) | undefined;
	onRemove: (member: ConversationMember) => void;
	onTransfer: (member: ConversationMember) => void;
}) {
	const group = useGroupConversation(conversationId);
	if (!group) return null;
	return (
		<div className="p-[var(--spacing-3)]">
			<MemberList
				members={group.members}
				personId={personId}
				ownerId={group.ownerId}
				onOpen={onOpenMember}
				onRemove={group.closedReason ? undefined : onRemove}
				onTransfer={group.closedReason ? undefined : onTransfer}
			/>
		</div>
	);
}

export function GroupAddMembersPage({ conversationId, personId, onDone }: GroupPageProps & { onDone: () => void }) {
	const { t } = useTranslation();
	const group = useGroupConversation(conversationId);
	if (!group) return null;
	if (group.closedReason || !group.ownerId || group.ownerId !== personId) {
		return (
			<p role="status" className="p-[var(--spacing-5)] text-caption text-[var(--color-text-secondary)]">
				{t(group.closedReason ? "members.errors.conversationClosed" : "errors.forbidden")}
			</p>
		);
	}
	return <GroupAddMembers conversation={group} onDone={onDone} inPage />;
}

export function GroupAddMembers({
	conversation,
	onDone,
	inPage = false,
}: {
	conversation: Conversation;
	onDone: () => void;
	inPage?: boolean;
}) {
	const { addMembers } = useGroupActions(conversation.id);
	return (
		<div className={inPage ? "h-full p-[var(--spacing-5)]" : "p-[var(--spacing-5)]"}>
			<AddMembers
				conversation={conversation}
				adding={addMembers.isPending}
				error={addMembers.error}
				inPage={inPage}
				onCancel={inPage ? undefined : onDone}
				onAdd={(memberIds) => addMembers.mutate({ memberIds }, { onSuccess: onDone })}
			/>
		</div>
	);
}
