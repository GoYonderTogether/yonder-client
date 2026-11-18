/**
 * A Bot's social.md (the user's R45): how this Bot presents itself and speaks to people who are
 * not its owner. Every Bot has one; `custom` is false while it is the shipped default, which is
 * never copied in, so a later edit of the default reaches every Bot that has not written its own.
 */
export interface BotSocialResponse {
	social: string;
	custom: boolean;
}

/** `PUT /v1/bots/:id/social`. `null` goes back to the shipped default. */
export interface UpdateBotSocialRequest {
	social: string | null;
}
