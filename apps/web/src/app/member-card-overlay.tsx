import type { LayoutMode } from "@yonder/ui-shell";
import { Overlay } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { MemberCardView } from "../pages/member-card.tsx";

/**
 * A member's card as a layer on top of the chat (17 3.1): the chat header opens the peer, group
 * info opens a member. It is the same `Overlay` Bot detail uses — centred on a wide desktop, a full
 * page on a phone — and the card itself is the members package's `MemberProfile` plus the one action
 * the server's `relation` allows.
 */
export function MemberCardOverlay({
	handle,
	mode,
	onClose,
}: {
	handle: string;
	mode: LayoutMode;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	// Opening a chat replaces the frame's message detail; the layer would otherwise sit over it.
	const openConversation = (conversationId: string) => {
		onClose();
		navigate(`/messages/${encodeURIComponent(conversationId)}`);
	};
	return (
		<Overlay
			open
			onClose={onClose}
			title={t("members.card.title")}
			mode={mode}
			mobileBackLabel={t("app.back")}
			closeLabel={t("app.close")}
		>
			<MemberCardView
				handle={handle}
				onOpenConversation={openConversation}
				// A Bot's owner opens their own card in the same layer, one level up.
				onOpenOwner={(owner) => navigate(`/@${encodeURIComponent(owner)}`)}
				onOpenPrivacy={() => navigate("/me/privacy")}
				onHome={() => navigate("/messages", { replace: true })}
			/>
		</Overlay>
	);
}
