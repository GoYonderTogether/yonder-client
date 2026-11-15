import { expect, test } from "vitest";
import { phoneGate, smsGate, wechatErrorKind, wechatGate } from "./wechat";

test("requires terms, prevents reentry and handles unavailable, declined and expired authorization", () => {
	expect(wechatGate(false, false, true)).toBe("terms");
	expect(wechatGate(true, true, true)).toBe("busy");
	expect(wechatGate(false, true, false)).toBe("unavailable");
	expect(wechatGate(false, true, true)).toBe("ready");
	expect(phoneGate(true, true, "code", 10, 1)).toBe("busy");
	expect(phoneGate(false, false, "code", 10, 1)).toBe("terms");
	expect(phoneGate(false, true, undefined, 10, 1)).toBe("declined");
	expect(phoneGate(false, true, "code", 10, 10)).toBe("expired");
	expect(phoneGate(false, true, "code", 10, 9)).toBe("ready");
	expect(wechatErrorKind({ code: "wechat_conflict" })).toBe("conflict");
	expect(wechatErrorKind({ code: "code_expired" })).toBe("expired");
	expect(wechatErrorKind({ code: "wechat_not_configured" })).toBe("unavailable");
	expect(smsGate(false, false, 0, true)).toBe("terms");
	expect(smsGate(true, true, 0, true)).toBe("busy");
	expect(smsGate(false, true, 5, true)).toBe("busy");
	expect(smsGate(false, true, 0, false)).toBe("invalid");
	expect(smsGate(false, true, 0, true)).toBe("ready");
});
