import type { Member } from "@yonder/protocol";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ContactProfile, ContactsPageList, ContactsPagePlaceholder } from "../pages/contacts-list.tsx";
import type { usePageNavigation } from "./use-page-navigation.ts";

export function useContactScreens(
	handle: string | null,
	contacts: Member[] | undefined,
	navigation: ReturnType<typeof usePageNavigation>,
) {
	const [showRequests, setShowRequests] = useState(false);
	const { state } = useLocation();
	const navigate = useNavigate();
	const closeProfile = () => {
		if (navigation.currentState()?.tabLocation === "/contacts") navigate(-1);
		else navigation.back("/contacts");
	};
	const openMemberCard = (id: string) => navigation.open(`/@${encodeURIComponent(id)}`);
	return {
		list: (
			<ContactsPageList
				onOpen={(next) => {
					const target = `/contacts/profile/${encodeURIComponent(next)}`;
					if (handle) navigate(target, { replace: true, state });
					else navigation.open(target);
				}}
				onOpenGroup={(id) => navigation.open(`/messages/${encodeURIComponent(id)}`)}
				showRequests={!handle && showRequests}
				onChange={(requests) => {
					setShowRequests(requests);
					if (requests && handle) closeProfile();
				}}
			/>
		),
		content: handle ? (
			<ContactProfile
				handle={handle}
				onOpenConversation={(id) => navigation.open(`/messages/${encodeURIComponent(id)}`)}
				onOpenOwner={openMemberCard}
				onOpenBot={openMemberCard}
				onOpenPrivacy={() => navigation.open("/me/privacy")}
				onHome={closeProfile}
			/>
		) : !showRequests && contacts?.some((member) => member.kind === "person" || member.kind === "bot") ? (
			<ContactsPagePlaceholder />
		) : null,
		onBack: handle ? closeProfile : undefined,
	};
}
