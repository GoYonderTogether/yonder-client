import type { PricingMessages } from "./pricing-en.ts";

/** The Chinese side of the public price page. Same keys as English, checked by the type. */
export const pricingMessagesZhCN: PricingMessages = {
	title: "价格",
	conversion: "1 元可换 {{quota}} 额度。",
	modelTitle: "模型调用",
	modelNote: "单位是元/百万 token；{{baseline}} 为 1 倍。",
	tier: "档位",
	input: "输入",
	output: "输出",
	cacheWrite: "缓存写入",
	cacheRead: "缓存命中",
	multiple: "{{multiple}} 倍 {{baseline}}",
	grantsTitle: "赠送",
	signup: "注册赠送",
	monthly: "每月赠送",
	monthlyNote: "每月赠送先扣，月底未用完的作废。",
	rulesTitle: "各个额度",
	purpose: {
		main: "和自己的 Bot 聊天、主 Bot 自己的工具",
		background: "定时任务、会议纪要和后台任务",
		coding: "用了连接器的子任务",
		external: "其他人通过分享和你的 Bot 聊天",
	},
	overflowYes: "用完后按 {{rate}} 倍扣主额度，主额度保底 {{floor}}。",
	overflowNo: "用完不扣主额度。",
	noFloor: "用完后按 {{rate}} 倍扣主额度。",
	inviteTitle: "邀请",
	inviteRule: "你获得 {{inviter}}，对方获得 {{invitee}}，进主额度。最多 {{maxInvites}} 人。",
	loadFailed: "价格加载失败。",
	retry: "重试",
};
