/** First-run setup after sign-up: your name, your Bot's name, and what to connect (18 新用户引导). */
export const setupMessagesEn = {
	progress: "Setup progress",
	botTitle: "Name your Bot",
	connectTitle: "Let it handle things for you",
	start: "Start using Yonder",
} as const;

export type SetupMessages = { [K in keyof typeof setupMessagesEn]: string };
