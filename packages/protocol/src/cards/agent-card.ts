import type { MemberCard } from "../member/member.ts";

export type AgentCardKind =
	| "card_draft"
	| "confirm"
	| "digest"
	// A question asked by a server tool that must run its answer itself (a face-match question),
	// rather than the `options` tool's chat message. Same choices body as any question card.
	| "question";

export type AgentCardState = "open" | "working" | "done" | "dismissed" | "expired" | "failed";

export interface CardTarget {
	path: string;
	from?: "card";
}

export interface CardSource {
	label: string;
	target: CardTarget | { url: string };
}

interface CardActionBase {
	id: string;
	label: string;
	style: "primary" | "secondary" | "danger";
	confirm?: string;
}

export type CardAction = CardActionBase &
	({ kind: "answer"; target?: never } | { kind: "open" | "go"; target: CardTarget });

export type CardPreview =
	| { kind: "profile"; displayName: string; handle?: string; bio?: string }
	| { kind: "markdown"; text: string }
	| { kind: "image"; attachmentId: string };

export type CardBody =
	| {
			type: "rows";
			rows: {
				id: string;
				title: string;
				value: string;
				control?:
					| { type: "edit" }
					| { type: "switch"; checked: boolean }
					| { type: "select"; options: { id: string; label: string }[] };
			}[];
	  }
	| { type: "list"; items: { id: string; title: string; subtitle?: string; target?: CardTarget }[] }
	| {
			type: "progress";
			sources: {
				id: string;
				label: string;
				read: number;
				total: number | null;
				state: "reading" | "done" | "failed";
				failure?: string;
				cancel?: CardAction;
			}[];
	  }
	| { type: "choices"; options: { id: string; label: string }[]; selected?: string }
	| { type: "preview"; preview: CardPreview };

export interface AgentCard {
	id: string;
	kind: AgentCardKind;
	state: AgentCardState;
	title: string;
	body?: CardBody;
	preview?: CardPreview;
	/** Exact prospective visitor card from a private, server-verified owner review. */
	namecardReview?: { card: MemberCard };
	sources?: CardSource[];
	open?: CardTarget;
	actions?: CardAction[];
	result?: string;
	failure?: string;
	version: number;
}

export interface AgentCardActionRequest {
	actionId: string;
	version: number;
}

export interface AgentCardDismissRequest {
	version: number;
}

export interface AgentCardActionResponse {
	card: AgentCard;
	target?: CardTarget;
}
