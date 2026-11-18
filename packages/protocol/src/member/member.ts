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
	/** The Bot's owner member id; null for a person. */
	ownerId: string | null;
	/** True for the account's one default Bot, which cannot be deleted (15-Bot生命周期). */
	isDefault: boolean;
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
	/** Whether the public handle may be changed now (架构-03: first change free, then every 30 days). */
	handleChange: HandleChange;
	settings: MemberSettings;
}

export interface HandleChange {
	canChange: boolean;
	/** When the next change opens; null while a change is allowed. */
	nextChangeAt: string | null;
}

/** Every way the account can sign in, one entry per bound method. */
export type SignInMethodSummary =
	| {
			channel: "sms";
			/** Only the last four digits; the full number never leaves the server after sign-in. */
			masked: string;
			boundAt: string;
	  }
	| {
			/** A WeChat mini program identity. The open id is never sent to a client. */
			channel: "wechat";
			boundAt: string;
	  };

/** `POST /v1/me/handle`. */
export interface ChangeHandleRequest {
	handle: string;
}

export interface ChangeHandleResponse {
	me: MeResponse;
	oldHandle: string;
	/** Until then the old handle is kept for this member and nobody else can take it. */
	oldHandleRedirectUntil: string;
	nextChangeAt: string;
}

export type ThemePreference = "system" | "light" | "dark";
export type LocalePreference = "zh-CN" | "en";

export interface MemberSettings {
	locale: LocalePreference;
	theme: ThemePreference;
}

/**
 * Who may find and see the person's card (19 第四节). Three switches, nothing else. A Bot's card
 * follows its owner's switches. All three start on: a card is meant to be found and shared.
 */
export interface PrivacySettings {
	/** A stranger can find this person by the exact public handle. */
	searchable: boolean;
	/** Signed-in people can open the card at `/@handle`. */
	cardForUsers: boolean;
	/** Anyone with the link can open it, signed in or not. */
	cardPublicLink: boolean;
}

/** `PATCH /v1/me/privacy`. Only the switches present change. */
export type UpdatePrivacyRequest = Partial<PrivacySettings>;

/** What a card shows: the same four things for a person and a Bot, nothing more. */
export interface MemberCard {
	kind: MemberKind;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	avatarColor?: string | null;
	bio: string | null;
	/**
	 * A Bot's owner, for whoever may see the owner's own card; null for a person, and for a Bot
	 * whose owner's card this viewer may not see.
	 */
	owner: { handle: string; displayName: string } | null;
}

/**
 * `GET /v1/members/:handle`. Open to anyone the card's switches allow, signed in or not; every
 * other case is one 404, so "no such handle" and "closed to you" cannot be told apart.
 * The fields after `card` exist only for a signed-in caller, who needs them to act on the card.
 */
export interface MemberProfileResponse {
	card: MemberCard;
	/** Signed-in callers only: what `POST /v1/contacts` takes. */
	memberId?: string;
	/** Signed-in callers only: how the caller already stands with this member. */
	relation?: "self" | "own_bot" | "contact" | "none";
	/** Signed-in callers only: the open private chat with this member, when there is one. */
	conversationId?: string | null;
	/** Signed-in callers only: both of you have saved each other, so a direct message is the way in. */
	friend?: boolean;
	/**
	 * A person's card only (never a Bot's): their Bots, the reception Bot first. Every one of them
	 * can be talked to directly (`POST /v1/visits` with its handle); the reception Bot is the one
	 * the person chose for people who come with a matter.
	 */
	bots?: CardBot[];
}

/** One of a person's Bots as their card lists it: enough to show it and to open a chat with it. */
export interface CardBot {
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	avatarColor?: string | null;
	/** True for the one Bot the person receives visitors with. */
	reception: boolean;
}

/**
 * Which of the account's Bots receives people who come with a matter. `custom` is false while it
 * is simply the default Bot: nothing was chosen, so a deleted choice falls back to it on its own.
 */
export interface ReceptionSetting {
	botId: string;
	custom: boolean;
}

/** `PUT /v1/me/reception`. `null` goes back to the default Bot. */
export interface UpdateReceptionRequest {
	botId: string | null;
}

/** `PATCH /v1/me`. Every field is optional; only the ones present change. */
export interface UpdateMeRequest {
	displayName?: string;
	bio?: string | null;
	settings?: Partial<MemberSettings>;
}
