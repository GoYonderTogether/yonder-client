import { runFailureText } from "@yonder/chat-model";
import { describe, expect, it } from "vitest";

describe("run failure sentences", () => {
	it("says a pool that ran out, so the owner knows what to top up", () => {
		expect(runFailureText("main_quota_exhausted", "zh-CN")).toEqual({ text: "主额度已用完", tone: "action" });
		expect(runFailureText("background_quota_floor", "en")).toEqual({
			text: "Background quota is used up",
			tone: "action",
		});
	});

	it("says a bot that stalled or looped stopped, never how", () => {
		expect(runFailureText("tool_repeat", "zh-CN")).toEqual({ text: "Bot 卡在重复操作上，已停下", tone: "quiet" });
		expect(runFailureText("idle_timeout", "en")).toEqual({ text: "The Bot stalled and stopped", tone: "quiet" });
	});

	it("never shows our own reason codes, in either language", () => {
		for (const reason of ["reply_protocol", "persistence_error", "provider_http_502", "checkpoint_invalid_output: x"])
			expect(runFailureText(reason, "zh-CN")).toEqual({ text: "这次没有回复", tone: "quiet" });
		expect(runFailureText(null, "en")).toEqual({ text: "No reply this time", tone: "quiet" });
	});

	it("says what the owner can change: a long chat, an unreadable voice, an offline device", () => {
		expect(runFailureText("context_full", "zh-CN")).toEqual({ text: "对话太长，已停下", tone: "quiet" });
		expect(runFailureText("speech_no_text", "en")).toEqual({ text: "No speech was heard", tone: "quiet" });
		expect(runFailureText("device_offline", "en")).toEqual({ text: "The selected device is offline", tone: "action" });
	});
});
