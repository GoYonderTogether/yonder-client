/**
 * A stranger talking to someone else's Bot (19 第二节). The interface only ever says what the
 * server's visit state means and what the reader can do about it, one line and its actions.
 */
const visitErrorMessagesEn = {
	visit_limit: "The free messages with this Bot are used up. Waiting for its owner to approve.",
	visit_denied: "The Bot's owner declined to continue this chat.",
	visit_cap: "This chat's free allowance is used up. You can continue with your own quota.",
} as const;

export const visitsMessagesEn = {
	hostPending: "{{name}} wants to keep messaging your Bot",
	approve: "Approve",
	decline: "Decline",
	visitorPending: "Free messages used up. Waiting for the owner to approve.",
	addContact: "Add as contact",
	added: "Contact added",
	visitorCapped: "This chat's free allowance is used up.",
	payRest: "Pay for the rest myself",
	visitorDenied: "The Bot's owner declined to continue this chat.",
	actionFailed: "That action did not go through.",
	startChat: "Start chat",
	startFailed: "Could not start this chat.",
	waitingForYou: "Waiting for you",
	selfPayQuota: "Your own quota is used up. Sending a message will not start a reply.",
	errors: visitErrorMessagesEn,
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type VisitsMessages = Widen<typeof visitsMessagesEn>;
