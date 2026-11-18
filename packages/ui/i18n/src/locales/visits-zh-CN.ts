import type { VisitsMessages } from "./visits-en.ts";

/** 陌生人和别人的 Bot 聊天（19 第二节）：只说真实情况和能做的事，一句话加动作。 */
export const visitsMessagesZhCN: VisitsMessages = {
	hostPending: "{{name}} 想继续和你的 Bot 聊天",
	approve: "批准继续",
	decline: "拒绝",
	visitorPending: "免费消息用完了，正在等主人批准。",
	addContact: "加为联系人",
	added: "已加为联系人",
	visitorCapped: "这个对话的免费额度用完了。",
	payRest: "后续由我支付",
	visitorDenied: "Bot 的主人拒绝继续这个对话。",
	actionFailed: "这个操作没有成功。",
	startChat: "开始聊天",
	startFailed: "没能开始这个聊天。",
	waitingForYou: "待批准",
	selfPayQuota: "你自己的额度已用完，发消息不会有回复。",
	errors: {
		visit_limit: "和这个 Bot 的免费消息用完了，正在等主人批准。",
		visit_denied: "Bot 的主人拒绝继续这个对话。",
		visit_cap: "这个对话的免费额度用完了，可以从你自己的额度继续。",
	},
};
