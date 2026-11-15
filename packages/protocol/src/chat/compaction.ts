export interface CompactConversationRequest {
	clientNonce: string;
}

export type CompactConversationResponse =
	| {
			status: "compacted";
			compactedMessages: number;
			retainedMessages: number;
			contextVersion: number;
	  }
	| {
			status: "unchanged";
			reason: "not_enough_messages" | "not_smaller";
			compactedMessages: 0;
			retainedMessages: number;
			contextVersion: number;
	  };
