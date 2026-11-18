import type { ConversationVisit } from "@yonder/protocol";
import { describe, expect, it } from "vitest";
import { isVisitErrorCode, visitErrorSentence, visitSentence } from "./visits";

const visit = (value: Partial<ConversationVisit> & Pick<ConversationVisit, "role" | "state">): ConversationVisit => ({
	id: "visit",
	trialSent: 3,
	trialLimit: 3,
	botId: "bot",
	...value,
});

describe("who a visit chat is waiting on", () => {
	it("names the visitor to the Bot's owner, and only while it is pending", () => {
		expect(visitSentence(visit({ role: "host", state: "pending" }), "Ann", "zh-CN")).toBe("Ann 想继续和你的 Bot 聊天");
		expect(visitSentence(visit({ role: "host", state: "pending" }), "Ann", "en")).toBe(
			"Ann wants to keep messaging your Bot",
		);
		expect(visitSentence(visit({ role: "host", state: "open" }), "Ann", "en")).toBeNull();
	});
	it("says the real state to a visitor and nothing during the free trial", () => {
		expect(visitSentence(visit({ role: "visitor", state: "pending" }), "", "en")).toBe(
			"Free messages used up. Waiting for the owner to approve.",
		);
		expect(visitSentence(visit({ role: "visitor", state: "capped" }), "", "zh-CN")).toBe(
			"继续聊天需要你确认使用自己的额度，或由主人选择支付。",
		);
		expect(visitSentence(visit({ role: "visitor", state: "denied" }), "", "en")).toBe(
			"The Bot's owner declined to continue this chat.",
		);
		expect(visitSentence(visit({ role: "visitor", state: "trial" }), "", "en")).toBeNull();
		expect(visitSentence(visit({ role: "visitor", state: "open" }), "", "en")).toBeNull();
	});
});

describe("a refused send says what happened", () => {
	it("keeps the three visit codes apart", () => {
		expect(visitErrorSentence("visit_limit", "en")).toBe(
			"The free messages with this Bot are used up. Waiting for its owner to approve.",
		);
		expect(visitErrorSentence("visit_denied", "zh-CN")).toBe("Bot 的主人拒绝继续这个对话。");
		expect(visitErrorSentence("visit_cap", "en")).toBe(
			"To continue, confirm use of your quota or ask the owner to pay.",
		);
	});
	it("recognises only the codes it knows", () => {
		expect(isVisitErrorCode("visit_cap")).toBe(true);
		expect(isVisitErrorCode("conversation_closed")).toBe(false);
	});
});
