import type { Member } from "./member.ts";
export interface FriendRequest {
	id: string;
	sender: Member;
	recipient: Member;
	status: "pending" | "accepted";
	createdAt: string;
	acceptedAt: string | null;
	version: number;
}
