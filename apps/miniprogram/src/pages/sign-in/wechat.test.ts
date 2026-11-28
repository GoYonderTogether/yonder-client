import { expect, test } from "vitest";
import { phoneGate, smsGate, wechatErrorKind, wechatGate } from "./wechat";

test("allows sign-in without a checkbox and preserves unavailable, declined and expired authorization", () => {
	expect(wechatGate(true, true)).toBe("busy");
	expect(wechatGate(false, false)).toBe("unavailable");
	expect(wechatGate(false, true)).toBe("ready");
	expect(phoneGate(true, "code", 10, 1)).toBe("busy");
	expect(phoneGate(false, undefined, 10, 1)).toBe("declined");
	expect(phoneGate(false, "code", 10, 10)).toBe("expired");
	expect(phoneGate(false, "code", 10, 9)).toBe("ready");
	expect(wechatErrorKind({ code: "wechat_conflict" })).toBe("conflict");
	expect(wechatErrorKind({ code: "code_expired" })).toBe("expired");
	expect(wechatErrorKind({ code: "wechat_not_configured" })).toBe("unavailable");
	expect(smsGate(true, 0, true)).toBe("busy");
	expect(smsGate(false, 5, true)).toBe("busy");
	expect(smsGate(false, 0, false)).toBe("invalid");
	expect(smsGate(false, 0, true)).toBe("ready");
});
