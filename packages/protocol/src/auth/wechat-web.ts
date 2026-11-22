import type { SignInResponse } from "./auth.ts";

export interface WechatWebAttempt {
	ticket: string;
	authorizeUrl: string;
	expiresIn: number;
}

export type WechatWebStatus =
	| { status: "pending" | "expired" | "failed" | "unlinked" | "linked" }
	| ({ status: "signed_in" } & SignInResponse);
