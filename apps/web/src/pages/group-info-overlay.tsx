import { GroupInfo } from "@yonder/feature-members";
import type { Conversation, ConversationMember } from "@yonder/protocol";
import type { LayoutMode } from "@yonder/ui-shell";
import { Overlay } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";

/**
 * 「群资料」as a layer, the way Bot detail is one: a centred dialog on a wide desktop, a full page
 * on a phone (17 3.2). It is only reachable from a group's chat header, so the conversation it
 * shows is the one already on screen.
 */
export function GroupInfoOverlay({
	conversation,
	personId,
	mode,
	onClose,
	onOpenMember,
	onLeft,
}: {
	conversation: Conversation;
	personId: string | undefined;
	mode: LayoutMode;
	onClose: () => void;
	onOpenMember: (member: ConversationMember) => void;
	/** Leaving removes the group from the viewer's list, so there is nothing left to show. */
	onLeft: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Overlay
			open
			onClose={onClose}
			title={t("members.group.title")}
			mode={mode}
			wide
			mobileBackLabel={t("app.back")}
			closeLabel={t("app.close")}
		>
			<GroupInfo conversation={conversation} personId={personId} onOpenMember={onOpenMember} onLeft={onLeft} />
		</Overlay>
	);
}
