export type OutwardRequestState = "open" | "answered" | "declined" | "cancelled" | "expired";

export interface OutwardRequestCard {
	id: string;
	state: OutwardRequestState;
	expiresAt: string;
	/** Present on the private card in the owner's main conversation. */
	owner?: {
		visitConversationId: string;
		visitorName: string;
		question: string;
		why: string;
		priorReply: string | null;
	};
	decision?: "approve" | "reply";
	/** The terminal delivery in the visitor timeline. */
	result?: true;
}

export type OutwardRequestAction = { action: "approve" | "decline" | "cancel" } | { action: "reply"; text: string };
