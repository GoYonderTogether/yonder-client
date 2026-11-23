import { describe, expect, it } from "vitest";
import { runFailureSentence } from "./run-failure";

describe("run failure sentences", () => {
	it("says a repeated tool call stopped the Bot, in both languages", () => {
		expect(runFailureSentence("tool_repeat", "zh-CN")).toBe("Bot 反复执行同一个操作，已停止。");
		expect(runFailureSentence("tool_repeat", "en")).toBe("The Bot kept repeating the same action, so it was stopped.");
	});

	it("says a reply sent outside the reply rules did not go through", () => {
		expect(runFailureSentence("reply_protocol", "zh-CN")).toBe("Bot 没有按回复规则发送这条回复，这次回复没有成功。");
		expect(runFailureSentence("reply_protocol", "en")).toBe(
			"The Bot did not reply the way a reply is sent, so this reply did not go through.",
		);
	});

	it("says a chat run with no progress was stopped", () => {
		expect(runFailureSentence("idle_timeout", "en")).toBe(
			"The Bot made no progress for a long time, so it was stopped.",
		);
	});

	it("shows an unknown reason as the server sent it, and a missing one as a plain failure", () => {
		expect(runFailureSentence("provider_http_502", "en")).toBe("provider_http_502");
		expect(runFailureSentence(null, "zh-CN")).toBe("生成失败");
	});
});
