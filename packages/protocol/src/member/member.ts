/**
 * A member is either a person or a Bot; the chat platform only knows members (架构-03 第 1 条).
 * `id` is internal and never shown; `handle` is the public, changeable number.
 */
export type MemberKind = "person" | "bot";

export interface Member {
	/** `mem_…` or `bot_…`, ULID-shaped so it sorts by creation time. */
	id: string;
	kind: MemberKind;
	/** Public number: lowercase, 6–20 chars, letter first. */
	handle: string;
	displayName: string;
	/** Content-addressed: the `v` query parameter changes when the image changes. */
	avatarUrl: string | null;
	avatarColor?: string | null;
	bio: string | null;
	createdAt: string;
	/** Increments on every change; a client with an older copy replaces it. */
	version: number;
}

/** What `/v1/me` answers. The bot is here because every account has a primary Bot. */
export interface MeResponse {
	member: Member;
	bot: Member;
	signInMethods: SignInMethodSummary[];
	/** True once a password exists. Explicit, so the interface never has to infer it. */
	hasPassword: boolean;
	settings: MemberSettings;
}

export interface SignInMethodSummary {
	channel: "sms";
	/** Only the last four digits; the full number never leaves the server after sign-in. */
	masked: string;
	boundAt: string;
}

export type ThemePreference = "system" | "light" | "dark";
export type LocalePreference = "zh-CN" | "en";

export interface MemberSettings {
	locale: LocalePreference;
	theme: ThemePreference;
}

/** `PATCH /v1/me`. Every field is optional; only the ones present change. */
export interface UpdateMeRequest {
	displayName?: string;
	bio?: string | null;
	settings?: Partial<MemberSettings>;
}
