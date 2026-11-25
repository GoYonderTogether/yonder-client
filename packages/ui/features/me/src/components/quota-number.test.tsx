import { expect, test } from "vitest";
import { formatDay, formatExact, formatQuota, formatTokens } from "./quota-number.tsx";

test("every quota figure reads in millions, whatever the language", () => {
	expect(formatQuota(41_234_567, "zh-CN")).toBe("41.2M");
	expect(formatQuota(41_234_567, "en")).toBe("41.2M");
	expect(formatQuota(13_000, "en")).toBe("0.013M");
	expect(formatQuota(-13_000, "zh-CN", true)).toBe("-0.013M");
	expect(formatQuota(20_000_000, "en", true)).toBe("+20M");
	expect(formatQuota(400, "en")).toBe("<0.001M");
	expect(formatQuota(0, "en")).toBe("0");
	expect(formatExact(1_200_000, "en")).toBe("1,200,000");
});

test("tokens use the same unit once it helps, and days are Beijing days", () => {
	expect(formatTokens(8_000, "en")).toBe("8,000");
	expect(formatTokens(1_250_000, "en")).toBe("1.25M");
	expect(formatDay("2026-11-19", "en")).toBe("11/19");
	expect(formatDay("2026-11-19", "zh-CN")).toBe("11/19");
	// A billing day carries its own weekday, written the same way on every device.
	expect(formatDay("2026-11-19", "en", true)).toBe("11/19 Thu");
	expect(formatDay("2026-11-19", "zh-CN", true)).toBe("11/19 周四");
});
