import type { Conversation, ConversationMember } from "@yonder/protocol";
import type { LayoutMode } from "@yonder/ui-shell";
import { useState } from "react";
import { GroupInfoOverlay } from "../pages/group-info-overlay.tsx";
import { BotDetailOverlay } from "./bot-detail-overlay.tsx";
import { MemberCardOverlay } from "./member-card-overlay.tsx";

/**
 * The layers the frame can put over itself. The Bot detail is opened from the chat header or
 * 「我 › Bot」 (17 3.5); its own page machinery would fight the phone's page stack. Anyone else's
 * card is a layer too: a person or a Bot this account does not own opens their `/@handle` card here
 * rather than leaving the chat (17 3.1).
 */
export function useFrameLayers() {
	const [botDetail, setBotDetail] = useState<string | null>(null);
	const [memberCard, setMemberCard] = useState<string | null>(null);
	const [groupInfo, setGroupInfo] = useState(false);
	return { botDetail, setBotDetail, memberCard, setMemberCard, groupInfo, setGroupInfo };
}

export type FrameLayers = ReturnType<typeof useFrameLayers>;

export function FrameOverlays({
	layers,
	conversation,
	personId,
	mode,
	onBotDeleted,
	onOpenMember,
	onLeftGroup,
}: {
	layers: FrameLayers;
	conversation: Conversation | undefined;
	personId: string | undefined;
	mode: LayoutMode | null;
	onBotDeleted: (chatId: string | undefined) => void;
	onOpenMember: (member: ConversationMember) => void;
	onLeftGroup: () => void;
}) {
	const { botDetail, setBotDetail, memberCard, setMemberCard, groupInfo, setGroupInfo } = layers;
	return (
		<>
			{botDetail ? (
				<BotDetailOverlay
					memberId={botDetail}
					mode={mode ?? "wide"}
					onClose={() => setBotDetail(null)}
					onDeleted={(chatId) => {
						setBotDetail(null);
						onBotDeleted(chatId);
					}}
				/>
			) : null}
			{memberCard ? (
				<MemberCardOverlay handle={memberCard} mode={mode ?? "wide"} onClose={() => setMemberCard(null)} />
			) : null}
			{groupInfo && conversation?.kind === "group" ? (
				<GroupInfoOverlay
					conversation={conversation}
					personId={personId}
					mode={mode ?? "wide"}
					onClose={() => setGroupInfo(false)}
					onOpenMember={onOpenMember}
					onLeft={() => {
						setGroupInfo(false);
						onLeftGroup();
					}}
				/>
			) : null}
		</>
	);
}
