export interface ChannelConnection {
	id: string;
	botId: string;
	brand: "feishu" | "lark";
	name: string | null;
	enabled: boolean;
	allowExternalDm: boolean;
	allowGroups: boolean;
	credentialState: "valid" | "invalid";
	status: "offline" | "connecting" | "connected" | "reconnecting" | "failed";
	missingPermissions: string[];
}

export type ChannelConversationAction = "allow" | "temporary" | "close" | "reset";

export interface ExternalChannelConversation {
	id: string;
	kind: "direct" | "group";
	state: "pending" | "open" | "temporary" | "closed";
	expiresAt: string | null;
	lastMessageAt: string;
}

export interface ExternalChannelMessagePage {
	items: { id: string; sender: "bot" | "external"; name: string | null; text: string; createdAt: string }[];
	before: string | null;
}

export interface ChannelAttempt {
	id: string;
	botId: string;
	state: "awaiting" | "connecting" | "completed" | "expired" | "cancelled" | "failed";
	expiresAt: string;
	connectionId: string | null;
	link: { url: string; expiresAt: string } | null;
}
