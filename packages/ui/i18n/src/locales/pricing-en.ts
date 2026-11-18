/**
 * The public price page (额度方案 第十一节). Every figure is filled in from `/v1/quota/rates` and
 * `/v1/quota/config`; this table only supplies the words around them. Nothing here may name a
 * vendor or a model id.
 */
export const pricingMessagesEn = {
	title: "Prices",
	conversion: "1 yuan buys {{quota}} quota.",
	modelTitle: "Model calls",
	modelNote: "Yuan per million tokens; {{baseline}} is 1×.",
	tier: "Tier",
	input: "Input",
	output: "Output",
	cacheWrite: "Cache write",
	cacheRead: "Cache read",
	multiple: "{{multiple}}× {{baseline}}",
	toolsTitle: "Tools",
	tool: "Tool",
	perCall: "Per call",
	grantsTitle: "Grants",
	signup: "On sign-up",
	monthly: "Every month",
	monthlyNote: "Monthly quota is spent first and expires at the end of the month.",
	rulesTitle: "Each balance",
	purpose: {
		main: "Chatting with your Bot and its own tools",
		background: "Scheduled tasks, meeting notes and background work",
		coding: "Subtasks that use a connector",
		external: "Other people talking to your Bot",
		tools: "Tools charged per call, such as web search and page reads",
	},
	overflowYes: "When spent, drawn from main at {{rate}}×, keeping main at {{floor}} or more.",
	overflowNo: "Never drawn from main.",
	noFloor: "When spent, drawn from main at {{rate}}×.",
	inviteTitle: "Invites",
	inviteRule: "You get {{inviter}}, your friend gets {{invitee}}. Up to {{maxInvites}} friends count.",
	loadFailed: "Could not load the prices.",
	retry: "Try again",
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type PricingMessages = Widen<typeof pricingMessagesEn>;
