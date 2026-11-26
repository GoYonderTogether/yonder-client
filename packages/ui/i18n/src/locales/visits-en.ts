/**
 * A stranger talking to someone else's Bot (19 第二节). The interface only ever says what the
 * server's visit state means and what the reader can do about it, one line and its actions.
 */
const visitErrorMessagesEn = {
	visit_limit: "The free messages with this Bot are used up. Waiting for its owner to approve.",
	visit_denied: "The Bot's owner declined to continue this chat.",
	visit_cap: "To continue, confirm use of your quota or ask the owner to pay.",
} as const;

export const visitsMessagesEn = {
	relayTitle: "Visitor request",
	relayAsk: "Ask Bot to pass it on",
	relayOpen: "Passed to the main Bot",
	relayApproved: "The owner approved this request",
	relayAnswered: "The owner replied",
	relayDeclined: "This request was closed",
	relayCancelled: "The visitor cancelled this request",
	relayExpired: "This request timed out",
	relayFrom: "From {{name}}",
	relayPrior: "Bot's previous reply: {{reply}}",
	relayReply: "Reply visible to the visitor",
	relaySend: "Approve and send reply",
	relayApprove: "Approve request",
	relayDecline: "Decline request",
	relayCancel: "Cancel request",
	relayCancelAsk: "Cancel this request?",
	relayCancelConfirm: "Cancel it",
	relayKeep: "Keep it",
	relayOpenVisit: "Open visitor conversation",
	relayOpenMain: "Open main Bot conversation",
	relayAlreadyOpen: "There’s already a request with the main Bot.",
	relayRateLimit: "You can ask the main Bot once every 24 hours.",
	relayPrivateDraft: "Private suggestion",
	relayUseDraft: "Use private suggestion",
	hostPending: "{{name}} wants to keep messaging your Bot",
	approve: "Approve",
	hostPays: "I will pay for this conversation",
	confirmPayText: "Continuing will use your main quota.",
	confirmPay: "Confirm payment",
	decline: "Decline",
	visitorPending: "Free messages used up. Waiting for the owner to approve.",
	addContact: "Add as contact",
	added: "Contact added",
	visitorCapped: "To continue, confirm use of your quota or ask the owner to pay.",
	payRest: "Pay for the rest myself",
	visitorDenied: "The Bot's owner declined to continue this chat.",
	actionFailed: "That action did not go through.",
	startChat: "Start chat",
	startFailed: "Could not start this chat.",
	waitingForYou: "Waiting for you",
	incoming: "Bot visits",
	incomingEmpty: "No Bot visits yet",
	incomingBack: "Back to Bot visits",
	incomingUnread: "New Bot visits",
	incomingFor: "Visited your {{name}}",
	selfPayQuota: "Your own quota is used up. Sending a message will not start a reply.",
	errors: visitErrorMessagesEn,
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type VisitsMessages = Widen<typeof visitsMessagesEn>;
