import type { Conversation } from "@yonder/protocol";
import { useTranslation } from "react-i18next";
import { closedGroupNotice } from "./system-events.ts";

export interface ClosedGroupNoticeProps {
	conversation: Pick<Conversation, "closedReason">;
}

/**
 * What a reader sees where the composer would be once a group is read only: 该群聊已被解散 for a
 * dissolved group, 你已被移出群聊 for someone removed from it (19 3.2, R13). It renders nothing for
 * an open group, so Web-B can mount it unconditionally.
 */
export function ClosedGroupNotice({ conversation }: ClosedGroupNoticeProps) {
	const { t } = useTranslation();
	const notice = closedGroupNotice(conversation.closedReason, t);
	if (!notice) return null;
	return (
		<p
			role="status"
			className="mx-[var(--spacing-4)] my-[var(--spacing-3)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-center text-caption text-[var(--color-text-secondary)]"
		>
			{notice}
		</p>
	);
}
